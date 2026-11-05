import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import { getCPUUsage } from '../modules/cpu.js';
import { getMemoryUsage } from '../modules/ram.js';
import { getSwapUsage } from '../modules/swap.js';
import { formatSpeed, formatSize } from '../modules/net.js';
import { getDiskUsage } from '../modules/disk.js';
import { getOpenPorts } from '../modules/ports.js';
import { AccentWatcher } from '../modules/theme.js';

export default class SystemMonitorDashboard {

    setOpen(isOpen) {
        this._isOpen = isOpen;
    }

    constructor(extension, closeCallback = null, themeCallback = null) {
        this._extension = extension;
        this._themeCallback = themeCallback;
        this._closeCallback = closeCallback;
        this._isOpen = false;
        this._iconBoxes = [];
        this._accent = [53, 132, 228];

        // Main horizontal box (Sidebar on left, Content on right)
        this.actor = new St.BoxLayout({
            vertical: false,
            style_class: 'system-monitor-dashboard',
        });

        // 1. Build the Sidebar
        this._sidebar = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'dashboard-sidebar',
        });

        this._tabRes = new St.Button({
            label: 'Resources',
            style_class: 'dash-tab dash-tab-active', // Active by default
            x_align: Clutter.ActorAlign.START,
        });

        this._tabPorts = new St.Button({
            label: 'Open Ports',
            style_class: 'dash-tab',
            x_align: Clutter.ActorAlign.START,
        });

        this._sidebar.add_child(this._tabRes);
        this._sidebar.add_child(this._tabPorts);

        this.actor.add_child(this._sidebar);

        // 2. Build the Content Area container
        this._contentContainer = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'dashboard-content',
        });

        this.actor.add_child(this._contentContainer);

        // --- Page 1: Resources Page ---
        this._resourcesPage = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'dashboard-page',
        });

        // Row 1: CPU, RAM, Swap cards (your existing row)
        this._summaryRow = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            style_class: 'dashboard-summary-row',
        });

        this._resourcesPage.add_child(this._summaryRow);

        // Inside your constructor, you can fetch the totals once:
        const cpuInfo = getCPUUsage();
        const ramInfo = getMemoryUsage();
        const swapInfo = getSwapUsage();

        this._cpuCard = this._makeCard('cpu-icon.svg', 'CPU: --%', `Total Cores: ${cpuInfo.cores}`);
        this._ramCard = this._makeCard('ram-icon.svg', 'RAM: --%', `Total RAM: ${ramInfo.totalStr}`);
        this._swapCard = this._makeCard('swap-icon.svg', 'Swap: --%', `Total Swap: ${swapInfo.totalStr}`);

        this._summaryRow.add_child(this._cpuCard.card);
        this._summaryRow.add_child(this._ramCard.card);
        this._summaryRow.add_child(this._swapCard.card);

        // --- Row 2: Network & Disk Cards (New) ---
        this._secondRow = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            style_class: 'dashboard-summary-row',
        });

        this._resourcesPage.add_child(this._secondRow);

        this._netCardActor = this._makeNetworkCard();
        this._secondRow.add_child(this._netCardActor);

        this._diskCard = this._makeDiskCard();
        this._secondRow.add_child(this._diskCard);

        // --- Footer Row with Launch Button (New) ---
        const footerRow = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            style_class: 'dashboard-footer-row',
        });
        this._resourcesPage.add_child(footerRow);

        this._launchButton = new St.Button({
            label: 'Open System Monitor',
            style_class: 'dash-action-button',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            can_focus: true,
            reactive: true,
        });

        // Open gnome-system-monitor when clicked
        this._launchButton.connect('clicked', () => {
            try {
                // Close the menu if the callback was provided
                if (this._closeCallback) {
                    this._closeCallback();
                }
                Gio.DesktopAppInfo.new('net.nokyan.Resources.desktop')?.launch([], null);


            } catch (e) {
                log(`[SystemMonitor] Failed to launch system monitor: ${e.message}`);
            }
        });

        footerRow.add_child(this._launchButton);

        this._contentContainer.add_child(this._resourcesPage);

        // --- Page 2: Open Ports Page ---
        this._portsPage = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'dashboard-page',
        });

        // Header for Ports section with a toggle or subtitle
        const portsHeader = new St.BoxLayout({ vertical: false, style_class: 'ports-header-row' });
        portsHeader.add_child(new St.Label({ text: 'Open Ports', style_class: 'dash-title', x_expand: true }));
        this._portsCountLabel = new St.Label({ text: 'Ports: 0', style_class: 'dash-sub' });
        portsHeader.add_child(this._portsCountLabel);
        this._portsPage.add_child(portsHeader);

        // Table Header Row (PORT | PID | SERVICE | USER)
        const tableHeader = new St.BoxLayout({ vertical: false, style_class: 'ports-table-header' });
        tableHeader.add_child(new St.Label({ text: 'PORT', style_class: 'port-col-port' }));
        tableHeader.add_child(new St.Label({ text: 'PID', style_class: 'port-col-pid' }));
        tableHeader.add_child(new St.Label({ text: 'SERVICE', style_class: 'port-col-service', x_expand: true }));
        tableHeader.add_child(new St.Label({ text: 'USER', style_class: 'port-col-user' }));
        this._portsPage.add_child(tableHeader);

        // Safe Scroll container to prevent breaking dashboard layout height
        this._portsScrollBox = new St.ScrollView({
            style_class: 'ports-scrollbox',
            x_expand: true,
            y_expand: true,
        });
        this._portsScrollBox.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);

        // 👉 MAKE SURE THIS LINE IS PRESENT:
        this._portsListContainer = new St.BoxLayout({ vertical: true, style_class: 'ports-list' });
        
        this._portsScrollBox.set_child(this._portsListContainer);
        this._portsPage.add_child(this._portsScrollBox);

        this._portsPage.visible = false; 
        this._contentContainer.add_child(this._portsPage);

        // 3. Hook up Tab Switching Clicks
        this._tabRes.connect('clicked', () => this._switchTab(true));
        this._tabPorts.connect('clicked', () => this._switchTab(false));

        // 4. Follow the system accent color
        this._accentWatcher = new AccentWatcher((rgb, isDark) => {
            this._applyTheme(isDark);
            this._applyAccent(rgb);
        });
    }

    _applyTheme(isDark) {
        if (isDark)
            this.actor.remove_style_class_name('dash-light');
        else
            this.actor.add_style_class_name('dash-light');

        this._themeCallback?.(isDark);
    }

    _applyAccent(rgb) {
        this._accent = rgb;
        const [r, g, b] = rgb;

        for (const box of this._iconBoxes)
            box.set_style(`background-color: rgba(${r}, ${g}, ${b}, 0.28);`);

        this._launchButton?.set_style(
            `background-color: rgba(${r}, ${g}, ${b}, 0.30); border-color: rgba(${r}, ${g}, ${b}, 0.9);`);

        this._refreshTabs();
    }

    _refreshTabs() {
        const [r, g, b] = this._accent;
        const activeStyle = `background-color: rgba(${r}, ${g}, ${b}, 0.35);`;
        const resActive = this._resourcesPage?.visible ?? true;
        this._tabRes?.set_style(resActive ? activeStyle : '');
        this._tabPorts?.set_style(resActive ? '' : activeStyle);
    }

    _updateCardState(cardObj, value, titlePrefix) {
        // 1. Update the label text
        cardObj.titleLabel.set_text(`${titlePrefix}: ${value.toFixed(0)}%`);

        // 2. Clear old state classes first
        cardObj.card.remove_style_class_name('dash-card-warning');
        cardObj.card.remove_style_class_name('dash-card-critical');

        // 3. Apply new state class based on thresholds
        if (value >= 85) {
            cardObj.card.add_style_class_name('dash-card-critical'); // Red for > 85%
        } else if (value >= 70) {
            cardObj.card.add_style_class_name('dash-card-warning');  // Yellow for > 70%
        }
    }

    // Called from your panel timer on every tick
    update({ cpu, ram, swap, net, ramInfo, swapInfo }) {

        if (!this._isOpen) return;

        if (this._cpuCard && cpu !== undefined) {
            this._updateCardState(this._cpuCard, cpu, 'CPU');
        }
        if (this._ramCard && ram !== undefined) {
            this._updateCardState(this._ramCard, ram, 'RAM');
        }
        if (this._swapCard && swap !== undefined) {
            this._updateCardState(this._swapCard, swap, 'Swap');
        }

        if (ramInfo)
            this._ramCard.subLabel.set_text(`Used: ${ramInfo.usedStr} / ${ramInfo.totalStr}`);
        if (swapInfo)
            this._swapCard.subLabel.set_text(swapInfo.totalStr === 'None'
                ? 'Swap: not configured'
                : `Used: ${swapInfo.usedStr} / ${swapInfo.totalStr}`);

        // Network card updates from the net object passed by panel
        if (net) {
            if (this._dlStat) this._dlStat.set_text(`Download: ${formatSpeed(net.down)}`);
            if (this._ulStat) this._ulStat.set_text(`Upload: ${formatSpeed(net.up)}`);
            if (this._totalDl) this._totalDl.set_text(`Total Download: ${formatSize(net.totalDown)}`);
            if (this._totalUl) this._totalUl.set_text(`Total Upload: ${formatSize(net.totalUp)}`);
            if (this._netSubLabel && net.interface) {
                this._netSubLabel.set_text(`Interface: ${net.interface}`);
            }
        }

        // Disk card fetches its own data independently right here!
        const disk = getDiskUsage('/');
        if (disk) {
            if (this._diskTotal) this._diskTotal.set_text(`Total: ${formatSize(disk.total)}`);
            if (this._diskUsed) this._diskUsed.set_text(`Used: ${formatSize(disk.total - disk.free)}`);
            if (this._diskFree) this._diskFree.set_text(`Free: ${formatSize(disk.free)}`);
        }
    }

    _switchTab(showResources) {
        // 1. Show one page, hide the other
        this._resourcesPage.visible = showResources;
        this._portsPage.visible = !showResources;

        // 2. Change the highlight styling on the buttons
        if (showResources) {
            this._tabRes.add_style_class_name('dash-tab-active');
            this._tabPorts.remove_style_class_name('dash-tab-active'); // (or tabPorts)
        } else {
            this._tabPorts.add_style_class_name('dash-tab-active');
            this._tabRes.remove_style_class_name('dash-tab-active');
            this.updatePorts();
        }
        this._refreshTabs();
    }

    _makeCard(iconFile, title, sub) {
        const card = new St.BoxLayout({
            style_class: 'dash-card',
            vertical: true,
            x_expand: true,
        });

        const topcard = new St.BoxLayout({
            style_class: 'dash-card-top',
            vertical: false,
            x_expand: true,
        });

        const iconBox = new St.Bin({
            style_class: 'dash-icon-box',
            width: 36,   // Explicit width matching CSS
            height: 36,  // Explicit height matching CSS
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({
                gicon: new Gio.FileIcon({
                    file: Gio.File.new_for_path(`${this._extension.path}/icons/${iconFile}`),
                }),
                icon_size: 18,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            }),
        });

        this._iconBoxes.push(iconBox);

        const titleLabel = new St.Label({
            text: title,
            style_class: 'dash-title',
            y_align: Clutter.ActorAlign.CENTER,
        });

        topcard.add_child(iconBox);
        topcard.add_child(titleLabel);

        const subLabel = new St.Label({
            text: sub,
            style_class: 'dash-sub',
        });

        card.add_child(topcard);
        card.add_child(subLabel)

        return { card, titleLabel, subLabel };
    }

    _makeNetworkCard() {
        const card = new St.BoxLayout({
            style_class: 'dash-card',
            vertical: true,
            x_expand: true,
        });

        const topcard = new St.BoxLayout({
            style_class: 'dash-card-top',
            vertical: false,
            x_expand: true,
        });

        const iconBox = new St.Bin({
            style_class: 'dash-icon-box',
            width: 36, height: 36,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({
                gicon: new Gio.FileIcon({
                    file: Gio.File.new_for_path(`${this._extension.path}/icons/network-icon.svg`),
                }),
                icon_size: 18,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            }),
        });

        this._iconBoxes.push(iconBox);

        const titleBox = new St.BoxLayout({ vertical: true, y_align: Clutter.ActorAlign.CENTER });
        const titleLabel = new St.Label({ text: 'Network', style_class: 'dash-title' });

        // Subtitle for interface name
        this._netSubLabel = new St.Label({ text: 'Interface: --', style_class: 'dash-sub' });
        titleBox.add_child(titleLabel);
        titleBox.add_child(this._netSubLabel);

        topcard.add_child(iconBox);
        topcard.add_child(titleBox);
        card.add_child(topcard);

        const statsBox = new St.BoxLayout({ vertical: true, style_class: 'dash-stats-box' });

        this._dlStat = new St.Label({ text: 'Download: 0 B/s', style_class: 'dash-stat-text' });
        this._ulStat = new St.Label({ text: 'Upload: 0 B/s', style_class: 'dash-stat-text' });
        this._totalDl = new St.Label({ text: 'Total Download: 0 B', style_class: 'dash-stat-text' });
        this._totalUl = new St.Label({ text: 'Total Upload: 0 B', style_class: 'dash-stat-text' });

        statsBox.add_child(this._dlStat);
        statsBox.add_child(this._ulStat);
        statsBox.add_child(this._totalDl);
        statsBox.add_child(this._totalUl);

        card.add_child(statsBox);

        return card;
    }

    _makeDiskCard() {
        const card = new St.BoxLayout({
            style_class: 'dash-card',
            vertical: true,
            x_expand: true,
        });

        const topcard = new St.BoxLayout({
            style_class: 'dash-card-top',
            vertical: false,
            x_expand: true,
        });

        const iconBox = new St.Bin({
            style_class: 'dash-icon-box',
            width: 36, height: 36,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({
                gicon: new Gio.FileIcon({
                    file: Gio.File.new_for_path(`${this._extension.path}/icons/disk-icon.svg`),
                }),
                icon_size: 18,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            }),
        });

        this._iconBoxes.push(iconBox);

        const titleLabel = new St.Label({ text: 'Disk', style_class: 'dash-title', y_align: Clutter.ActorAlign.CENTER });
        topcard.add_child(iconBox);
        topcard.add_child(titleLabel);
        card.add_child(topcard);

        const statsBox = new St.BoxLayout({ vertical: true, style_class: 'dash-stats-box', });

        this._diskTotal = new St.Label({ text: 'Total: --', style_class: 'dash-stat-text' });
        this._diskUsed = new St.Label({ text: 'Used: --', style_class: 'dash-stat-text' });
        this._diskFree = new St.Label({ text: 'Free: --', style_class: 'dash-stat-text' });

        statsBox.add_child(this._diskTotal);
        statsBox.add_child(this._diskUsed);
        statsBox.add_child(this._diskFree);

        card.add_child(statsBox);

        return card;
    }

    updatePorts() {
        if (!this._portsPage.visible) return;

        // Clear existing rows safely
        this._portsListContainer.destroy_all_children();
        
        // Fetch ports using your expanded module function
        let ports = getOpenPorts(false); // pass true if you want to include all established connections, false for listening ports only
        this._portsCountLabel.set_text(`Ports: ${ports.length}`);

        const [r, g, b] = this._accent;

        ports.forEach(p => {
            let row = new St.BoxLayout({ vertical: false, style_class: 'port-row', reactive: true });

            // Port Label (Styled with your dynamic system accent color)
            let portLabel = new St.Label({ text: String(p.port), style_class: 'port-item-port' });
            portLabel.set_style(`color: rgb(${r}, ${g}, ${b}); font-weight: bold;`);

            let pidLabel = new St.Label({ text: String(p.pid), style_class: 'port-item-pid' });
            let serviceLabel = new St.Label({ text: p.service, style_class: 'port-item-service', x_expand: true });
            let userLabel = new St.Label({ text: String(p.user), style_class: 'port-item-user' });

            row.add_child(portLabel);
            row.add_child(pidLabel);
            row.add_child(serviceLabel);
            row.add_child(userLabel);

            // Optional hover/tooltip or click-to-copy behavior
            row.connect('button-release-event', () => {
                let clipboard = St.Clipboard.get_default();
                clipboard.set_text(St.ClipboardType.CLIPBOARD, String(p.port));
                portLabel.set_text('Copied!');
                setTimeout(() => portLabel.set_text(String(p.port)), 1000);
            });

            this._portsListContainer.add_child(row);
        });
    }

    destroy() {
        this._accentWatcher?.destroy();
        this._accentWatcher = null;
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
}