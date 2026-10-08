import { useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'text' | 'accent' | 'danger' | 'on-dark';

export function Button({ variant = 'primary', size = 'md', block, icon, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'sm'; block?: boolean; icon?: IconName }) {
  return (
    <button type="button" className={`btn ${variant} ${size === 'sm' ? 'sm' : ''} ${block ? 'block' : ''} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 18 : 20} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, tone = 'default', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; tone?: 'default' | 'ghost' | 'on-dark' }) {
  return (
    <button type="button" aria-label={label} className={`icon-btn ${tone === 'default' ? '' : tone}`} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

export function Card({ children, onClick, className = '', flat, ...rest }: { children: ReactNode; onClick?: () => void; className?: string; flat?: boolean } & Omit<React.HTMLAttributes<HTMLElement>, 'onClick'>) {
  const cls = `card ${flat ? 'flat' : ''} ${className}`;
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} {...(rest as object)}>
        {children}
      </button>
    );
  }
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}

export function Badge({ tone = 'default', children }: { tone?: 'default' | 'warning' | 'danger' | 'neutral'; children: ReactNode }) {
  return <span className={`badge ${tone === 'default' ? '' : tone}`}>{children}</span>;
}

export function Chip({ pressed, onClick, children, disabled }: { pressed: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function ProgressBar({ value, label, onDark }: { value: number; label?: string; onDark?: boolean }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`pbar ${onDark ? 'on-dark' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ProgressRing({ value, size = 120, stroke = 12, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const id = useId();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a3e635" />
            <stop offset="100%" stopColor="#065f46" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5eae7" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, small, label }: { options: ReadonlyArray<{ value: T; label: string }>; value: T; onChange: (v: T) => void; small?: boolean; label?: string }) {
  return (
    <div className={`segmented ${small ? 'small' : ''}`} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TextField({ label, hint, error, unit, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null; unit?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input id={id} className={`input ${unit ? 'has-unit' : ''} ${error ? 'invalid' : ''} ${className}`} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-e` : undefined} {...rest} />
        {unit && <span className="unit">{unit}</span>}
      </div>
      {hint && !error && <span className="hint">{hint}</span>}
      {error && (
        <span className="err" id={`${id}-e`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function SelectField({ label, hint, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select" {...rest}>
        {children}
      </select>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function ListItem({ icon, title, subtitle, trailing, onClick, disabled, lime }: { icon?: IconName; title: string; subtitle?: string; trailing?: ReactNode; onClick?: () => void; disabled?: boolean; lime?: boolean }) {
  const body = (
    <>
      {icon && (
        <span className={`li-icon ${lime ? 'lime' : ''}`}>
          <Icon name={icon} />
        </span>
      )}
      <span className="grow">
        <span className="li-title" style={{ display: 'block' }}>{title}</span>
        {subtitle && <span className="li-sub" style={{ display: 'block' }}>{subtitle}</span>}
      </span>
      <span className="li-trail">
        {trailing}
        {onClick && !disabled && <Icon name="chevronRight" size={18} />}
      </span>
    </>
  );
  if (onClick && !disabled) {
    return (
      <button type="button" className="list-item" onClick={onClick}>
        {body}
      </button>
    );
  }
  return (
    <div className="list-item" aria-disabled={disabled ? true : undefined}>
      {body}
    </div>
  );
}

export function MetricCard({ icon, label, value, delta, tone = 'flat', tint, onClick }: { icon: IconName; label: string; value: string; delta?: string; tone?: 'good' | 'bad' | 'flat'; tint?: boolean; onClick?: () => void }) {
  const cls = `metric ${tint && tone === 'good' ? 'tint-good' : ''} ${tint && tone === 'bad' ? 'tint-bad' : ''}`;
  const inner = (
    <>
      <div className="m-top">
        <span className="m-ic">
          <Icon name={icon} size={18} />
        </span>
        {label}
      </div>
      <div className="m-val">{value}</div>
      {delta && <div className={`m-delta tone-${tone}`}>{delta}</div>}
    </>
  );
  return onClick ? (
    <button type="button" className={cls} onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="e-ic">
        <Icon name={icon} size={26} />
      </span>
      <h3 className="t-h3">{title}</h3>
      {text && <p className="note">{text}</p>}
      {action}
    </div>
  );
}

export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grab" />
        <div className="row between" style={{ marginBottom: 14 }}>
          <h2 className="t-h2">{title}</h2>
          <IconButton icon="close" label="Закрыть" tone="ghost" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}
