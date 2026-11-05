import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { getCPUUsage } from '../modules/cpu.js';
import { getMemoryUsage } from '../modules/ram.js';
import { getSwapUsage } from '../modules/swap.js';
import { getNetworkSpeed, formatSpeed } from '../modules/net.js';

import SystemMonitorDashboard from '../dashboard/dashboard.js';


const SystemMonitorPanel = GObject.registerClass({
    GTypeName: 'SystemMonitorPanelButton',
},
    class SystemMonitorPanel extends PanelMenu.Button {
        constructor(extension) {
            super(0.0, 'System Monitor');
            this._extension = extension;

            this._box = new St.BoxLayout({
                style_class: 'panel-status-menu-box',
            });
            this.add_child(this._box);

            // Pass a widest/sample string for labels that change length dynamically (like network speeds)
            this._cpuLabel = this._addSet('cpu-icon.svg', 'CPU: --%', '', 'CPU: 100%');
            this._ramLabel = this._addSet('ram-icon.svg', 'RAM: --%', '', 'RAM: 100%');
            this._swapLabel = this._addSet('swap-icon.svg', 'Swap: --%', '', 'Swap: 100%');

            // For network speeds, give a representative maximum string like '999.9 MB/s' to prevent jitter
            this._upLabel = this._addSet('upload-icon.svg', '0 B/s', 'monitor-speed', '999.9 MB/s');
            this._downLabel = this._addSet('download-icon.svg', '0 B/s', 'monitor-speed', '999.9 MB/s');

            this._update();
            this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                this._update();
                return GLib.SOURCE_CONTINUE;
            });
            GLib.Source.set_name_by_id(this._timeoutId, '[system-monitor] update');

            this._dashboard = new SystemMonitorDashboard(
                this._extension,
                () => this.menu.close(),
                isDark => this._applyMenuTheme(isDark));

            const menuItem = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false,
            });
            menuItem.add_style_class_name('dashboard-menu-item');
            menuItem.actor.add_child(this._dashboard.actor);

            this.menu.addMenuItem(menuItem);

            this.menu.connect('open-state-changed', (menu, isOpen) => {
                this._dashboard?.setOpen(isOpen);
                if (isOpen)
                    this._update();   
            });
        }

        // Recolor the popup background (and its arrow) to match light/dark mode
        _applyMenuTheme(isDark) {
            this.menu.actor.set_style(isDark ? '' :
                '-arrow-background-color: #fafafa; -arrow-border-color: rgba(0, 0, 0, 0.15);');
        }

        _update() {
            const cpu = getCPUUsage();
            const ram = getMemoryUsage();
            const swap = getSwapUsage();
            const net = getNetworkSpeed();

            this._cpuLabel.set_text(`CPU: ${cpu.usage.toFixed(0)}%`);
            this._ramLabel.set_text(`RAM: ${ram.percent.toFixed(0)}%`);
            this._swapLabel.set_text(`Swap: ${swap.percent.toFixed(0)}%`);
            this._upLabel.set_text(formatSpeed(net.up));
            this._downLabel.set_text(formatSpeed(net.down));

            if (this._dashboard) {
                this._dashboard.update({
                    cpu: cpu.usage,
                    ram: ram.percent,
                    swap: swap.percent,
                    ramInfo: ram,
                    swapInfo: swap,
                    net,
                });
            }

            this._setLevel(this._cpuLabel, cpu.usage);
            this._setLevel(this._ramLabel, ram.percent);
            this._setLevel(this._swapLabel, swap.percent);

        }

        _setLevel(label, value, warn = 70, high = 90) {
            label.remove_style_class_name('monitor-warn');
            label.remove_style_class_name('monitor-high');

            if (value >= high)
                label.add_style_class_name('monitor-high');
            else if (value >= warn)
                label.add_style_class_name('monitor-warn');
        }

        _addSet(iconFile, initialText, extraClass = '', widestText = null) {
            const set = new St.BoxLayout({
                style_class: 'monitor-set',
                y_align: Clutter.ActorAlign.CENTER,
            });

            const icon = new St.Icon({
                gicon: new Gio.FileIcon({
                    file: Gio.File.new_for_path(`${this._extension.path}/icons/${iconFile}`),
                }),
                style_class: 'system-status-icon monitor-icon',
                icon_size: 16,
                y_align: Clutter.ActorAlign.CENTER,
            });

            const label = new St.Label({
                text: initialText,
                style_class: `monitor-label ${extraClass}`.trim(),
                y_align: Clutter.ActorAlign.CENTER,
            });

            set.add_child(icon);
            set.add_child(label);
            this._box.add_child(set);

            // If a widest text sample is provided, calculate its width or apply CSS styling
            if (widestText) {
                // Temporarily set text to the widest expected string to calculate natural width, then lock it
                label.set_text(widestText);
                const id = label.connect('notify::allocation', () => {
                    label.disconnect(id);
                    if (label.width > 0) {
                        label.set_style(`min-width: ${label.width}px;`);
                    }
                    // Restore initial text only if nothing newer has replaced the sample text
                    if (label.get_text() === widestText)
                        label.set_text(initialText);
                });
            }

            return label;
        }

        _onDestroy() {
            if (this._timeoutId) {
                GLib.source_remove(this._timeoutId);
                this._timeoutId = 0;
            }

            if (this._dashboard) {
                this._dashboard.destroy();
                this._dashboard = null;
            }

            super._onDestroy();
        }
    });

export default SystemMonitorPanel;