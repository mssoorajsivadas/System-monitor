import GLib from 'gi://GLib';

const decoder = new TextDecoder();

export function formatKB(kb) {
    const gb = kb / (1024 * 1024);
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(kb / 1024).toFixed(0)} MB`;
}

export function getMemoryUsage() {
    try {
        const [success, contents] = GLib.file_get_contents('/proc/meminfo');
        if (!success) return { percent: 0, totalStr: '0 GB', usedStr: '0 GB' };

        const memData = {};
        for (const line of decoder.decode(contents).split('\n')) {
            const m = line.match(/^(\w+(?:\([^)]*\))?):\s+(\d+)/);
            if (m) memData[m[1]] = parseInt(m[2], 10); // kB
        }

        const totalKB = memData['MemTotal'] || 0;
        // MemAvailable is what the kernel itself reports as usable memory
        const availKB = memData['MemAvailable'] ??
            ((memData['MemFree'] || 0) + (memData['Buffers'] || 0) + (memData['Cached'] || 0));
        const usedKB = Math.max(0, totalKB - availKB);
        const percent = totalKB > 0 ? (usedKB / totalKB) * 100 : 0;

        return {
            percent: Math.min(100, Math.max(0, percent)),
            totalStr: formatKB(totalKB),
            usedStr: formatKB(usedKB),
        };
    } catch (e) {
        return { percent: 0, totalStr: '0 GB', usedStr: '0 GB' };
    }
}
