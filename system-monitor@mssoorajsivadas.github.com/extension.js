import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import SystemMonitorPanel from './panel/panel.js';
import { resetNetworkUsage } from './modules/net.js';

export default class SystemMonitor extends Extension {
    enable() {
        resetNetworkUsage();
        this._panel = new SystemMonitorPanel(this);
        Main.panel.addToStatusArea(this.uuid, this._panel);
    }

    disable() {
        this._panel?.destroy();
        this._panel = null;
    }
}