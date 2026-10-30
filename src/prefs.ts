import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {APPEARANCE_KEYS, OPACITY, SIZE} from './appearance.ts';

type Choice = readonly [string, string];

const N_ = (text: string): string => text;

const BADGE_MODES: readonly Choice[] = [
    ['always', N_('Always')],
    ['attention', N_('Blocked or done')],
    ['never', N_('Never')],
];

function comboRow(
    settings: Gio.Settings,
    key: string,
    title: string,
    subtitle: string,
    choices: readonly Choice[],
): Adw.ComboRow {
    const row = new Adw.ComboRow({
        title,
        subtitle,
        model: Gtk.StringList.new(choices.map(([, label]) => _(label))),
    });
    const sync = () => {
        const index = choices.findIndex(([value]) => value === settings.get_string(key));
        row.selected = Math.max(0, index);
    };
    sync();
    const id = settings.connect(`changed::${key}`, sync);
    row.connect('notify::selected', () => {
        const value = choices[row.selected]?.[0];
        if (value !== undefined && value !== settings.get_string(key)) {
            settings.set_string(key, value);
        }
    });
    row.connect('destroy', () => {
        settings.disconnect(id);
    });
    return row;
}

function hotkeyRow(settings: Gio.Settings): Adw.EntryRow {
    const row = new Adw.EntryRow({
        title: _('Agent menu shortcut (Enter to apply)'),
        show_apply_button: true,
        text: settings.get_strv('menu-hotkey')[0] ?? '',
    });
    row.connect('apply', () => {
        const text = row.text.trim();
        const [ok, key, mods] = Gtk.accelerator_parse(text);
        if (text === '') {
            settings.set_strv('menu-hotkey', []);
            row.remove_css_class('error');
        } else if (ok && key !== 0 && mods !== null && Gtk.accelerator_valid(key, mods)) {
            settings.set_strv('menu-hotkey', [Gtk.accelerator_name(key, mods)]);
            row.remove_css_class('error');
        } else {
            row.add_css_class('error');
        }
    });
    return row;
}

function spinRow(
    settings: Gio.Settings,
    key: string,
    title: string,
    subtitle: string,
    lower: number,
    upper: number,
): Adw.SpinRow {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        adjustment: new Gtk.Adjustment({lower, upper, step_increment: 1, page_increment: 10}),
    });
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function switchRow(settings: Gio.Settings, key: string, title: string, subtitle = ''): Adw.SwitchRow {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function colorRow(settings: Gio.Settings, key: string, title: string): Adw.ActionRow {
    const row = new Adw.ActionRow({title});
    const button = new Gtk.ColorDialogButton({
        dialog: new Gtk.ColorDialog({with_alpha: false}),
        valign: Gtk.Align.CENTER,
    });
    const sync = () => {
        const rgba = new Gdk.RGBA();
        if (rgba.parse(settings.get_string(key))) {
            button.rgba = rgba;
        }
    };
    sync();
    const id = settings.connect(`changed::${key}`, sync);
    button.connect('notify::rgba', () => {
        const value = button.rgba.to_string();
        if (value !== settings.get_string(key)) {
            settings.set_string(key, value);
        }
    });
    row.connect('destroy', () => {
        settings.disconnect(id);
    });
    row.add_suffix(button);
    row.activatable_widget = button;
    return row;
}

function resetRow(settings: Gio.Settings, keys: readonly string[], title: string, subtitle: string): Adw.ActionRow {
    const row = new Adw.ActionRow({title, subtitle});
    const button = new Gtk.Button({label: _('Reset'), valign: Gtk.Align.CENTER});
    button.connect('clicked', () => {
        for (const key of keys) {
            settings.reset(key);
        }
    });
    row.add_suffix(button);
    return row;
}

export default class HerdrPipPreferences extends ExtensionPreferences {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    override fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        window.add(page);
        window.set_default_size(620, 900);

        const badge = new Adw.PreferencesGroup({
            title: _('Badge'),
            description: _(
                'Click the badge to pick an agent: Herdr focuses it and its terminal window is raised. Drag the badge to move it.',
            ),
        });
        page.add(badge);
        badge.add(
            comboRow(settings, 'overlay-badge', _('Show the badge'), _('Floats over fullscreen windows'), BADGE_MODES),
        );
        badge.add(hotkeyRow(settings));
        badge.add(
            resetRow(
                settings,
                ['badge-position', 'badge-monitor'],
                _('Position'),
                _('Back to the top-right corner of the primary monitor'),
            ),
        );

        const look = new Adw.PreferencesGroup({title: _('Look')});
        page.add(look);
        look.add(spinRow(settings, 'badge-size', _('Size'), _('Diameter in pixels'), SIZE.min, SIZE.max));
        look.add(colorRow(settings, 'badge-color', _('Background color')));
        look.add(spinRow(settings, 'badge-opacity', _('Background opacity'), _('Percent'), OPACITY.min, OPACITY.max));
        look.add(
            switchRow(
                settings,
                'badge-dot',
                _('Attention dot'),
                _('Red when an agent is blocked, green when one is done'),
            ),
        );
        look.add(
            switchRow(
                settings,
                'badge-ring',
                _('Progress ring'),
                _('Spins while an agent works, fills green when one is done, pulses red when one is blocked'),
            ),
        );
        look.add(resetRow(settings, APPEARANCE_KEYS, _('Default look'), ''));

        const toast = new Adw.PreferencesGroup({
            title: _('Toast'),
            description: _(
                'A short message next to the badge, also over fullscreen windows. Click it to jump to the agent.',
            ),
        });
        page.add(toast);
        toast.add(switchRow(settings, 'toast', _('Show toasts')));
        const rows = [
            switchRow(settings, 'toast-done', _('When an agent is done')),
            switchRow(settings, 'toast-blocked', _('When an agent needs you (blocked)')),
            spinRow(settings, 'toast-seconds', _('Stays for'), _('Seconds'), 2, 60),
        ];
        for (const row of rows) {
            settings.bind('toast', row, 'sensitive', Gio.SettingsBindFlags.GET);
            toast.add(row);
        }

        const status = new Adw.PreferencesGroup({
            title: _('Herdr'),
            description: _('Polls "herdr agent list".'),
        });
        page.add(status);

        const session = new Adw.EntryRow({
            title: _('Session, empty for the default (Enter to apply)'),
            show_apply_button: true,
            text: settings.get_string('session'),
        });
        session.connect('apply', () => {
            settings.set_string('session', session.text.trim());
        });
        status.add(session);
        status.add(spinRow(settings, 'poll-interval', _('Poll interval'), _('Seconds'), 1, 300));
        status.add(switchRow(settings, 'show-indicator', _('Also show in the top bar')));
        return Promise.resolve();
    }
}
