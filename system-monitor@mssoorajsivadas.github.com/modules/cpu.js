import GLib from 'gi://GLib';

let previousStats = null;

export function getCPUUsage() {
    try {
        let [success, contents] = GLib.file_get_contents('/proc/stat');
        if (!success || !contents) {
            log('[SystemMonitor] Error: Failed to read /proc/stat');
            return { usage: 0, cores: 1 };
        }

        let decoder = new TextDecoder('utf-8');
        let text = decoder.decode(contents);
        let lines = text.split('\n');
        
        let cpuLine = lines.find(line => line.startsWith('cpu '));
        if (!cpuLine) {
            return { usage: 0, cores: 1 };
        }

        // Count how many lines start with 'cpu' followed by a digit (cpu0, cpu1, etc.)
        let cores = 0;
        for (let line of lines) {
            if (line.startsWith('cpu') && line.length > 3) {
                let char = line[3];
                if (char >= '0' && char <= '9') {
                    cores++;
                }
            }
        }
        if (cores === 0) cores = 1;

        // Parse aggregate cpu metrics
        let parts = cpuLine.trim().split(/\s+/).slice(1).map(Number);
        let idle = parts[3] + (parts[4] || 0); // idle + iowait
        let total = parts.reduce((acc, val) => acc + val, 0);

        let usage = 0;
        if (previousStats) {
            let totalDiff = total - previousStats.total;
            let idleDiff = idle - previousStats.idle;

            if (totalDiff > 0) {
                usage = ((totalDiff - idleDiff) / totalDiff) * 100;
            }
        }

        previousStats = { total, idle };

        return {
            usage: Math.min(100, Math.max(0, usage)),
            cores: cores
        };
    } catch (e) {
        return { usage: 0, cores: 1 };
    }
}