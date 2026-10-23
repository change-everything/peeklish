export const LOGO = {
  top: '#FFD84A',
  bottom: '#F5B400',
  ink: '#2B2100',
  bowl: { cx: 16, cy: 13.5, outer: 6.5, inner: 3.3 },
  stem: { x: 9.5, y: 7, width: 3.2, height: 18 },
  underline: { x: 14.9, y: 22.6, width: 8, height: 2.6 },
} as const;

export function squirclePath(size = 32, exponent = 5, steps = 96): string {
  const half = size / 2;
  const points: string[] = [];
  for (let index = 0; index < steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = half + half * Math.sign(cos) * Math.abs(cos) ** (2 / exponent);
    const y = half + half * Math.sign(sin) * Math.abs(sin) ** (2 / exponent);
    points.push(`${x.toFixed(3)} ${y.toFixed(3)}`);
  }
  return `M${points.join('L')}Z`;
}
