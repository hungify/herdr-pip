import type {Status} from './herdr.ts';

export const SIZE = {min: 24, max: 96} as const;
export const OPACITY = {min: 10, max: 100} as const;

export const APPEARANCE_KEYS = ['badge-size', 'badge-color', 'badge-opacity', 'badge-dot', 'badge-ring'] as const;

type Rgb = [number, number, number];

const DEFAULT_RGB: Rgb = [53, 132, 228];

export interface Appearance {
    size: number;
    color: string;
    opacity: number;
    dot: boolean;
    ring: boolean;
}

export function parseColor(text: string): Rgb | null {
    const s = text.trim().toLowerCase();
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
    if (short) {
        return [hex(short[1], 2), hex(short[2], 2), hex(short[3], 2)];
    }
    const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(s);
    if (long) {
        return [hex(long[1], 1), hex(long[2], 1), hex(long[3], 1)];
    }
    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/.exec(s);
    if (rgb) {
        return [channel(rgb[1]), channel(rgb[2]), channel(rgb[3])];
    }
    return null;
}

function hex(digits: string | undefined, repeat: 1 | 2): number {
    return parseInt((digits ?? '0').repeat(repeat), 16);
}

function channel(digits: string | undefined): number {
    return Math.min(255, Number(digits ?? 0));
}

const FONT_SCALE = 0.42;

export function shade([r, g, b]: Rgb, amount: number): Rgb {
    const target = amount > 0 ? 255 : 0;
    const t = Math.min(1, Math.abs(amount));
    const mix = (c: number) => Math.round(c + (target - c) * t);
    return [mix(r), mix(g), mix(b)];
}

const rgba = ([r, g, b]: Rgb, alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

export function badgeStyle({size, color, opacity}: Pick<Appearance, 'size' | 'color' | 'opacity'>): string {
    const base = parseColor(color) ?? DEFAULT_RGB;
    const alpha = opacity / 100;
    return (
        [
            `width: ${size}px`,
            `height: ${size}px`,
            `border-radius: ${size / 2}px`,
            `font-size: ${Math.round(size * FONT_SCALE)}px`,
            `background-color: ${rgba(base, alpha)}`,
            'background-gradient-direction: vertical',
            `background-gradient-start: ${rgba(shade(base, 0.25), alpha)}`,
            `background-gradient-end: ${rgba(shade(base, -0.2), alpha)}`,
        ].join('; ') + ';'
    );
}

export function dotStyle(size: number): string {
    const px = Math.max(8, Math.round(size / 4));
    return `width: ${px}px; height: ${px}px; border-radius: ${px * 2}px;`;
}

export const RING_WIDTH = 2;
export const RING_GAP = 2;

export const STATUS_RGB: Record<Status, Rgb> = {
    blocked: [224, 27, 36],
    done: [46, 194, 126],
    working: [98, 160, 234],
    idle: [154, 153, 150],
    unknown: [154, 153, 150],
};
