const MARGIN = 12;
const TOAST_GAP = 8;

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type Position = [number, number];

export function clampInto(x: number, y: number, width: number, height: number, area: Rect): [number, number] {
    return [
        Math.round(Math.max(area.x, Math.min(x, area.x + area.width - width))),
        Math.round(Math.max(area.y, Math.min(y, area.y + area.height - height))),
    ];
}

function free(size: number, area: Rect): [number, number] {
    return [area.width - size - 2 * MARGIN, area.height - size - 2 * MARGIN];
}

export function positionToXY([fx, fy]: Position, size: number, area: Rect): [number, number] {
    const [freeX, freeY] = free(size, area);
    const x = fx < 0 ? freeX : Math.min(1, fx) * freeX;
    const y = fy < 0 ? 0 : Math.min(1, fy) * freeY;
    return [Math.round(area.x + MARGIN + x), Math.round(area.y + MARGIN + y)];
}

function fraction(offset: number, room: number): number {
    return room > 0 ? Math.max(0, Math.min(1, offset / room)) : 0;
}

export function xyToPosition([x, y]: [number, number], size: number, area: Rect): Position {
    const [freeX, freeY] = free(size, area);
    return [fraction(x - area.x - MARGIN, freeX), fraction(y - area.y - MARGIN, freeY)];
}

export function toastXY(
    [bx, by]: [number, number],
    size: number,
    width: number,
    height: number,
    area: Rect,
): [number, number] {
    const onRight = bx + size / 2 < area.x + area.width / 2;
    const x = onRight ? bx + size + TOAST_GAP : bx - width - TOAST_GAP;
    return clampInto(x, by + (size - height) / 2, width, height, area);
}

export function monitorAt(x: number, y: number, monitors: readonly Rect[]): number {
    return monitors.findIndex(m => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height);
}
