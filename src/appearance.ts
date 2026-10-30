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
    if (/^#[0-9a-f]{3}$/.test(s)) {
        const [r, g, b] = s.slice(1);
        return [hex(`${r}${r}`), hex(`${g}${g}`), hex(`${b}${b}`)];
    }
    if (/^#[0-9a-f]{6}$/.test(s)) {
        return [hex(s.slice(1, 3)), hex(s.slice(3, 5)), hex(s.slice(5, 7))];
    }
    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/.exec(s);
    if (rgb) {
        return [channel(rgb[1]), channel(rgb[2]), channel(rgb[3])];
    }
    return null;
}

function hex(digits: string): number {
    return parseInt(digits, 16);
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

export function grayscale([r, g, b]: Rgb): Rgb {
    const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    return [y, y, y];
}

const INACTIVE_ALPHA = 0.6;

const rgba = ([r, g, b]: Rgb, alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

export function badgeStyle(
    {size, color, opacity}: Pick<Appearance, 'size' | 'color' | 'opacity'>,
    inactive = false,
): string {
    const parsed = parseColor(color) ?? DEFAULT_RGB;
    const base = inactive ? grayscale(parsed) : parsed;
    const alpha = Math.round(opacity * (inactive ? INACTIVE_ALPHA : 1)) / 100;
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
