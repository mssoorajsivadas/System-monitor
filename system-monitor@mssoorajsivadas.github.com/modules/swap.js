import GLib from 'gi://GLib';
import { formatKB } from './ram.js';

const decoder = new TextDecoder();

export function getSwapUsage() {
    try {
        const [success, contents] = GLib.file_get_contents('/proc/meminfo');
        if (!success) return { percent: 0, totalStr: 'None', usedStr: '0 MB' };

        const memData = {};
        for (const line of decoder.decode(contents).split('\n')) {
            const m = line.match(/^(\w+(?:\([^)]*\))?):\s+(\d+)/);
            if (m) memData[m[1]] = parseInt(m[2], 10);
        }

        const totalKB = memData['SwapTotal'] || 0;
        const freeKB = memData['SwapFree'] || 0;
        const usedKB = Math.max(0, totalKB - freeKB);
        const percent = totalKB > 0 ? (usedKB / totalKB) * 100 : 0;

        return {
            percent: Math.min(100, Math.max(0, percent)),
            totalStr: totalKB > 0 ? formatKB(totalKB) : 'None',
            usedStr: formatKB(usedKB),
        };
    } catch (e) {
        return { percent: 0, totalStr: 'None', usedStr: '0 MB' };
    }
}
