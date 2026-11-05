import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// Cache usernames to avoid repeatedly reading /etc/passwd.
const usernameCache = new Map();

function readText(path) {
    try {
        const [success, contents] = GLib.file_get_contents(path);
        if (!success) return null;
        return new TextDecoder().decode(contents);
    } catch (e) {
        return null;
    }
}

// Resolve UID to username.
function getUsernameFromUid(uid) {
    if (uid === null || uid === undefined)
        return 'Unknown';

    if (usernameCache.has(uid))
        return usernameCache.get(uid);

    const passwd = readText('/etc/passwd');

    if (passwd) {
        for (const line of passwd.split('\n')) {
            const parts = line.split(':');
            if (parts.length >= 3 && Number(parts[2]) === uid) {
                usernameCache.set(uid, parts[0]);
                return parts[0];
            }
        }
    }

    return String(uid);
}

// Get process information directly from /proc.
function getProcessInfo(pid) {
    if (!pid) return null;

    const status = readText(`/proc/${pid}/status`);
    if (!status) return null;

    const uidMatch = status.match(/^Uid:\s+(\d+)/m);
    const comm = readText(`/proc/${pid}/comm`);
    const cmdline = readText(`/proc/${pid}/cmdline`);
    const cgroup = readText(`/proc/${pid}/cgroup`);

    return {
        uid: uidMatch ? Number(uidMatch[1]) : null,
        service: comm ? comm.trim() : 'Unknown',
        command: cmdline ? cmdline.replace(/\0/g, ' ').trim() : 'Unavailable',
        cgroup: cgroup ? cgroup.split('\n').filter(Boolean) : []
    };
}

function getExposure(address) {
    const host = address.replace(/:\d+$/, '');

    if (host === '127.0.0.1' || host === '[::1]')
        return 'localhost';

    if (host === '0.0.0.0' || host === '*' || host === '[::]')
        return 'all interfaces';

    return 'specific interface';
}

// Extract process information from ss output.
function getSocketProcesses(line) {
    const matches = [...line.matchAll(/\("([^"]+)",pid=(\d+),fd=(\d+)\)/g)];

    return matches.map(match => ({
        service: match[1],
        pid: Number(match[2]),
        fd: Number(match[3])
    }));
}

export function getOpenPorts(includeAll = false) {
    try {
        // Use absolute path since /usr/sbin is often missing from GNOME Shell's PATH
        const ssPath = GLib.find_program_in_path('ss') || '/usr/sbin/ss';

        const flags = [
            ssPath,
            '-H',
            '-n',
            '-t',
            '-u',
            includeAll ? '-a' : '-l',
            '-p',
            '-e'
        ];

        const proc = Gio.Subprocess.new(
            flags,
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );

        const [, stdout, stderr] = proc.communicate_utf8(null, null);

        if (!stdout || !stdout.trim()) {
            log(`[SystemMonitor] ss stdout empty or command failed. Stderr: ${stderr}`);
            return [];
        }

        const ports = [];

        for (const line of stdout.trim().split('\n')) {
            if (!line.trim()) continue;

            const parts = line.trim().split(/\s+/);
            if (parts.length < 5) continue;

            const protocol = parts[0];
            const state = parts[1];
            const localAddress = parts[4];
            const peerAddress = parts.length > 5 ? parts[5] : '*';

            const portMatch = localAddress.match(/:(\d+)$/);
            if (!portMatch) continue;

            const port = Number(portMatch[1]);

            // UID from ss extended socket information.
            const uidMatch = line.match(/\buid:(\d+)\b/);
            const socketUid = uidMatch ? Number(uidMatch[1]) : null;

            // Extract all processes associated with this socket.
            const socketProcesses = getSocketProcesses(line);

            const processList = socketProcesses.length
                ? socketProcesses
                : [{ service: 'Unknown', pid: null, fd: null }];

            for (const socketProcess of processList) {
                const process = getProcessInfo(socketProcess.pid);

                const uid = socketUid ?? process?.uid ?? null;
                const username = getUsernameFromUid(uid);
                const cgroup = process?.cgroup ?? [];
                const systemdService = cgroup.find(item => item.includes('.service')) ?? null;

                ports.push({
                    protocol,
                    state,
                    port,
                    localAddress,
                    peerAddress,
                    pid: socketProcess.pid ?? 'Unavailable',
                    service: process?.service && process.service !== 'Unknown' 
                        ? process.service 
                        : socketProcess.service,
                    user: username,
                    uid: uid ?? 'Unavailable',
                    exposure: getExposure(localAddress),
                    systemdService,
                    command: process?.command ?? 'Unavailable',
                    processFound: socketProcess.pid !== null && process !== null,
                    processInfo: line
                });
            }
        }

        return ports;

    } catch (e) {
        log(`[SystemMonitor] Port detection error: ${e.message}`);
        return [];
    }
}