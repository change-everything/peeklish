import type { CSSProperties } from 'react';

type Option<T extends string> = { id: T; label: string };

type Props<T extends string> = {
  label: string;
  value: T;
  options: Array<Option<T>>;
  onChange: (value: T) => void;
};

export function Segmented<T extends string>({ label, value, options, onChange }: Props<T>) {
  const index = Math.max(0, options.findIndex((option) => option.id === value));
  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={label}
      style={{ '--count': options.length, '--index': index } as CSSProperties}
    >
      <span className="segmented-thumb" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          className={option.id === value ? 'active' : ''}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
