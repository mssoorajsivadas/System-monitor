import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

let prevRx = 0;
let prevTx = 0;
let prevTime = 0;

export function resetNetworkUsage() {
    prevRx = 0;
    prevTx = 0;
    prevTime = 0;
}

// Returns {down, up, totalDown, totalUp, interface}
export function getNetworkSpeed() {
    let contents;
    try {
        [, contents] = Gio.File.new_for_path('/proc/net/dev').load_contents(null);
    } catch (e) {
        return { down: 0, up: 0, totalDown: 0, totalUp: 0, interface: 'N/A' };
    }

    const lines = new TextDecoder().decode(contents).split('\n').slice(2);

    let rx = 0;
    let tx = 0;
    let activeInterface = 'N/A';

    for (const line of lines) {
        if (!line.includes(':'))
            continue;

        const [name, data] = line.split(':');
        const iface = name.trim();

        // Skip loopback and virtual interfaces
        if (iface === 'lo' || /^(veth|docker|br-|virbr)/.test(iface))
            continue;

        const fields = data.trim().split(/\s+/).map(Number);
        
        // Pick the first valid active interface for display (e.g., wlan0, eth0, wlp2s0)
        if (activeInterface === 'N/A' && (fields[0] > 0 || fields[8] > 0)) {
            activeInterface = iface;
        }

        rx += fields[0];   // bytes received
        tx += fields[8];   // bytes transmitted
    }

    const now = GLib.get_monotonic_time();   // microseconds

    if (prevTime === 0) {
        prevRx = rx;
        prevTx = tx;
        prevTime = now;
        return { down: 0, up: 0, totalDown: rx, totalUp: tx, interface: activeInterface };
    }

    const seconds = (now - prevTime) / 1_000_000;
    const down = Math.max(0, (rx - prevRx) / seconds);
    const up = Math.max(0, (tx - prevTx) / seconds);

    prevRx = rx;
    prevTx = tx;
    prevTime = now;

    return { 
        down, 
        up, 
        totalDown: rx, 
        totalUp: tx, 
        interface: activeInterface 
    };
}

// Format live speeds (e.g., 1.5 KB/s)
export function formatSpeed(bytesPerSec) {
    if (bytesPerSec < 1024)
        return `${bytesPerSec.toFixed(0)} B/s`;
    if (bytesPerSec < 1024 * 1024)
        return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    if (bytesPerSec < 1024 * 1024 * 1024)
        return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
}

// Format cumulative data sizes (e.g., 1.2 GB)
export function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes.toFixed(0)} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}