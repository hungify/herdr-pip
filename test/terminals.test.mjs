import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PANEL_ID, PANEL_TITLE, TERMINALS, detectTerminal, shellQuote, herdrArgv,
    buildCommand, matchesPanel, panelGeometry,
} from '../gnome-extension/terminals.js';

const only = (...names) => name => names.includes(name);

test('detectTerminal honours order and preference', () => {
    assert.equal(detectTerminal(only('ptyxis', 'kitty')), 'kitty');
    assert.equal(detectTerminal(only('ptyxis', 'kitty'), 'ptyxis'), 'ptyxis');
    assert.equal(detectTerminal(only('kitty'), 'ptyxis'), 'kitty');
    assert.equal(detectTerminal(only('alacritty')), null);
    assert.equal(detectTerminal(only('foot'), 'alacritty'), 'foot');
});

test('buildCommand covers every listed terminal and sets the identity', () => {
    const herdr = herdrArgv('/usr/bin/herdr', 'work');
    assert.deepEqual(herdr, ['/usr/bin/herdr', '--session', 'work']);
    for (const t of TERMINALS) {
        const argv = buildCommand(t, herdr);
        assert.equal(argv[0], t);
        assert.ok(argv.join(' ').includes(PANEL_TITLE), `${t} sets the title`);
        assert.ok(argv.join(' ').includes('herdr'), `${t} runs herdr`);
    }
    assert.ok(buildCommand('foot', herdr).includes(PANEL_ID));
    assert.ok(buildCommand('ghostty', herdr).includes(`--class=${PANEL_ID}`));
    assert.equal(buildCommand('alacritty', herdr), null);
});

test('ptyxis passes herdr as one quoted string', () => {
    const argv = buildCommand('ptyxis', herdrArgv("/opt/my herdr/herdr", "a'b"));
    assert.equal(argv.at(-2), '-x');
    assert.equal(argv.at(-1), `'/opt/my herdr/herdr' '--session' 'a'\\''b'`);
});

test('shellQuote', () => {
    assert.equal(shellQuote("it's"), `'it'\\''s'`);
});

test('matchesPanel', () => {
    assert.ok(matchesPanel({wmClass: PANEL_ID}));
    assert.ok(matchesPanel({wmClass: PANEL_ID.toUpperCase()}));
    assert.ok(matchesPanel({appId: PANEL_ID}));
    assert.ok(matchesPanel({title: PANEL_TITLE}));
    assert.ok(!matchesPanel({wmClass: 'org.gnome.Ptyxis', title: 'Terminal'}));
    assert.ok(!matchesPanel({}));
});

test('panelGeometry stays inside the area', () => {
    for (const area of [
        {x: 0, y: 0, width: 2560, height: 1440},
        {x: 1920, y: 30, width: 1920, height: 1050},
        {x: 0, y: 0, width: 800, height: 600},
    ]) {
        const g = panelGeometry(area);
        assert.ok(g.x >= area.x && g.y >= area.y);
        assert.ok(g.x + g.width <= area.x + area.width);
        assert.ok(g.y + g.height <= area.y + area.height);
    }
    assert.deepEqual(panelGeometry({x: 0, y: 0, width: 2560, height: 1440}),
        {x: 1520, y: 560, width: 1024, height: 864});
});
