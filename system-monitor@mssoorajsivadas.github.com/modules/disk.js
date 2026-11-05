import Gio from 'gi://Gio';

// Returns {free, total, usedPercent}, with sizes in bytes
export function getDiskUsage(path = '/') {
    try {
        const info = Gio.File.new_for_path(path).query_filesystem_info(
            'filesystem::size,filesystem::free',
            null
        );

        const total = info.get_attribute_uint64('filesystem::size');
        const free = info.get_attribute_uint64('filesystem::free');
        const usedPercent = total > 0 ? ((total - free) / total) * 100 : 0;

        return {free, total, usedPercent};
    } catch (e) {
        return {free: 0, total: 0, usedPercent: 0};
    }
}

// Formats sizes nicely (e.g., 233G, 45M)
export function formatSize(bytes) {
    const GB = 1024 ** 3;
    const TB = 1024 ** 4;

    if (bytes >= TB)
        return `${(bytes / TB).toFixed(1)}T`;
    if (bytes >= 100 * GB)
        return `${(bytes / GB).toFixed(0)}G`;
    if (bytes >= GB)
        return `${(bytes / GB).toFixed(1)}G`;
    return `${(bytes / (1024 ** 2)).toFixed(0)}M`;
}