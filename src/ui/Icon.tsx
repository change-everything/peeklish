import { ICONS, type IconName, type Shape } from './icon-shapes';

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {(ICONS[name] as Shape[]).map((shape, index) =>
        shape[0] === 'path' ? (
          <path key={index} d={shape[1]} />
        ) : shape[0] === 'circle' ? (
          <circle key={index} cx={shape[1]} cy={shape[2]} r={shape[3]} />
        ) : (
          <rect key={index} x={shape[1]} y={shape[2]} width={shape[3]} height={shape[4]} rx={shape[5]} />
        ),
      )}
    </svg>
  );
}
