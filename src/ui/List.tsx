import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './icon-shapes';

export type ChipColor = 'yellow' | 'orange' | 'indigo' | 'teal' | 'blue' | 'green' | 'gray' | 'red';

export function Chip({ icon, color }: { icon: IconName; color: ChipColor }) {
  return (
    <span className={`chip ${color}`} aria-hidden="true">
      <Icon name={icon} size={17} />
    </span>
  );
}

export function Section({ title, footer, children, className }: { title?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className ? `list-section ${className}` : 'list-section'}>
      {title && <h2 className="group-title">{title}</h2>}
      <div className="group">{children}</div>
      {footer && <p className="group-foot">{footer}</p>}
    </section>
  );
}

type RowProps = {
  icon?: IconName;
  color?: ChipColor;
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  children?: ReactNode;
  danger?: boolean;
};

function RowBody({ icon, color, title, sub, value, children }: RowProps) {
  return (
    <>
      {icon && <Chip icon={icon} color={color ?? 'gray'} />}
      <span className="row-text">
        <span className="row-title">{title}</span>
        {sub && <span className="row-sub">{sub}</span>}
      </span>
      {value && <span className="row-value">{value}</span>}
      {children}
    </>
  );
}

export function Row(props: RowProps) {
  return (
    <div className={rowClass(props)}>
      <RowBody {...props} />
    </div>
  );
}

export function LinkRow(props: RowProps & { onClick: () => void }) {
  return (
    <button type="button" className={rowClass(props)} onClick={props.onClick}>
      <RowBody {...props} />
      <Icon name="chevron" size={16} className="chevron" />
    </button>
  );
}

export function ActionRow(props: RowProps & { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`${rowClass(props)}${props.danger ? ' row-danger' : ''}`} onClick={props.onClick} disabled={props.disabled}>
      <RowBody {...props} />
    </button>
  );
}

function rowClass(props: RowProps): string {
  return props.icon ? 'row has-chip' : 'row';
}
