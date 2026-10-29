// Pure helpers: no gi:// or resource:// imports, so they run under node for tests.

export const PANEL_ID = 'com.github.hungify.HerdrPip';
export const PANEL_TITLE = 'herdr-pip';

// Ordered by how reliably the window can be identified: terminals that let us
// set the Wayland app id come first, title-only terminals last.
export const TERMINALS = ['foot', 'ghostty', 'kitty', 'ptyxis', 'gnome-terminal'];

export function detectTerminal(isAvailable, preferred = '') {
    if (preferred && TERMINALS.includes(preferred) && isAvailable(preferred))
        return preferred;
    return TERMINALS.find(isAvailable) ?? null;
}

export function shellQuote(arg) {
    return `'${String(arg).replaceAll("'", `'\\''`)}'`;
}

export function herdrArgv(herdrPath, session = '') {
    return session ? [herdrPath, '--session', session] : [herdrPath];
}

// Returns the full argv that opens a terminal running `herdr`, or null for an
// unknown terminal. Flags are taken from each terminal's docs/source and are
// UNVERIFIED on a real machine (see docs/m0-results.md).
export function buildCommand(terminal, herdr) {
    switch (terminal) {
    case 'foot':
        return ['foot', '--app-id', PANEL_ID, '--title', PANEL_TITLE, ...herdr];
    case 'kitty':
        return ['kitty', '--class', PANEL_ID, '--title', PANEL_TITLE, ...herdr];
    case 'ghostty':
        return ['ghostty', `--class=${PANEL_ID}`, `--title=${PANEL_TITLE}`, '-e', ...herdr];
    case 'ptyxis':
        // Single instance with no app id option: --standalone forces a new
        // instance, matching then falls back to the title.
        return ['ptyxis', '--standalone', '--new-window', '--title', PANEL_TITLE,
            '-x', herdr.map(shellQuote).join(' ')];
    case 'gnome-terminal':
        return ['gnome-terminal', '--title', PANEL_TITLE, '--', ...herdr];
    default:
        return null;
    }
}

// Prefer the app id; the title is only a fallback because Herdr or the shell
// inside the terminal may overwrite it.
export function matchesPanel({wmClass = '', appId = '', title = ''}) {
    const id = PANEL_ID.toLowerCase();
    return wmClass.toLowerCase() === id || appId.toLowerCase() === id || title === PANEL_TITLE;
}

// `area` is a plain {x, y, width, height} (the monitor work area).
export function panelGeometry(area, margin = 16) {
    const width = Math.min(area.width - 2 * margin, Math.max(640, Math.round(area.width * 0.4)));
    const height = Math.min(area.height - 2 * margin, Math.max(400, Math.round(area.height * 0.6)));
    return {
        x: area.x + area.width - width - margin,
        y: area.y + area.height - height - margin,
        width,
        height,
    };
}
