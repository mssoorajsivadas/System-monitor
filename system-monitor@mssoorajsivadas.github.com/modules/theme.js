import Gio from 'gi://Gio';

// GNOME accent colors (Settings -> Appearance)
const ACCENTS = {
    blue:   [53, 132, 228],
    teal:   [33, 144, 164],
    green:  [58, 148, 74],
    yellow: [200, 136, 0],
    orange: [237, 91, 0],
    red:    [230, 45, 66],
    pink:   [213, 97, 153],
    purple: [145, 65, 172],
    slate:  [111, 131, 150],
};

const KEY = 'accent-color';
const SCHEME_KEY = 'color-scheme';

// Watches the system accent color + light/dark scheme.
// Calls onChange([r, g, b], isDark) now and on every change.
export class AccentWatcher {
    constructor(onChange) {
        this._onChange = onChange;
        this._settings = null;
        this._id = 0;
        this._schemeId = 0;

        try {
            const schema = Gio.SettingsSchemaSource.get_default()
                .lookup('org.gnome.desktop.interface', true);
            if (schema?.has_key(KEY)) {
                this._settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
                this._id = this._settings.connect(`changed::${KEY}`, () => this._emit());
            }
            if (schema?.has_key(SCHEME_KEY) && this._settings)
                this._schemeId = this._settings.connect(`changed::${SCHEME_KEY}`, () => this._emit());
        } catch (e) {
            log(`[SystemMonitor] accent watcher failed: ${e.message}`);
        }
        this._emit();
    }

    _emit() {
        const name = this._settings?.get_string(KEY) ?? 'blue';
        // 'prefer-dark' = dark; 'default' and 'prefer-light' = light
        const isDark = this._settings?.get_string(SCHEME_KEY) === 'prefer-dark';
        this._onChange(ACCENTS[name] ?? ACCENTS.blue, isDark);
    }

    destroy() {
        if (this._settings) {
            if (this._id) this._settings.disconnect(this._id);
            if (this._schemeId) this._settings.disconnect(this._schemeId);
        }
        this._settings = null;
        this._id = 0;
        this._schemeId = 0;
    }
}
