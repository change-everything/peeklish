import { useId } from 'react';
import { LOGO, squirclePath } from './logo-geometry';

const OUTLINE = squirclePath();
const { bowl, stem, underline } = LOGO;
const BOWL = `M${bowl.cx - bowl.outer} ${bowl.cy}a${bowl.outer} ${bowl.outer} 0 1 0 ${bowl.outer * 2} 0a${bowl.outer} ${bowl.outer} 0 1 0 ${-bowl.outer * 2} 0ZM${bowl.cx - bowl.inner} ${bowl.cy}a${bowl.inner} ${bowl.inner} 0 1 1 ${bowl.inner * 2} 0a${bowl.inner} ${bowl.inner} 0 1 1 ${-bowl.inner * 2} 0Z`;

export function Logo({ size = 28 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={LOGO.top} />
          <stop offset="1" stopColor={LOGO.bottom} />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={OUTLINE} fill={`url(#${id}-fill)`} />
      <path d={OUTLINE} fill={`url(#${id}-sheen)`} />
      <g fill={LOGO.ink}>
        <path d={BOWL} fillRule="evenodd" />
        <rect x={stem.x} y={stem.y} width={stem.width} height={stem.height} rx={stem.width / 2} />
        <rect x={underline.x} y={underline.y} width={underline.width} height={underline.height} rx={underline.height / 2} />
      </g>
    </svg>
  );
}

export function Wordmark({ size = 17 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      peeklish
    </span>
  );
}
