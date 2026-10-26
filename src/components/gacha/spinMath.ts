export const TAU = Math.PI * 2;
export const SPIN_MS = 3200;
export const TAIL_MS = 600;

/** CSS `cubic-bezier()` timing function: maps elapsed fraction x (0-1) to progress. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // x(t) is monotonic when x1, x2 are in [0, 1], so bisection always converges.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < x) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}

export const spinEase = cubicBezier(0.15, 0.9, 0.2, 1.0);

// Slice i spans [i, i+1) * (TAU / count) clockwise from the top pointer; the wheel is
// drawn rotated clockwise by `rotation`.

export function sliceAt(rotation: number, count: number): number {
  const a = (((-rotation % TAU) + TAU) % TAU) / (TAU / count);
  return Math.floor(a) % count;
}

/** Rotation that leaves slice `index` centred under the pointer after `turns` full spins. */
export function targetRotation(index: number, count: number, turns: number): number {
  return turns * TAU + TAU - (index + 0.5) * (TAU / count);
}
