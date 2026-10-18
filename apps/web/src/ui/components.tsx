import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
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

export function IconButton({ icon, label, tone = 'default', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; tone?: 'default' | 'ghost' | 'on-dark' }) {
  return (
    <button type="button" aria-label={label} className={`icon-btn ${tone === 'default' ? '' : tone} ${className}`} {...rest}>
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

export function Chip({ pressed, onClick, children, disabled, 'aria-label': ariaLabel }: { pressed: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; 'aria-label'?: string }) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} aria-label={ariaLabel} onClick={onClick} disabled={disabled}>
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

/** An on/off switch with a label (role="switch"). */
export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={`switch-row${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="grow">
        <span className="li-title" style={{ display: 'block' }}>{label}</span>
        {hint && <span className="t-small">{hint}</span>}
      </span>
      <span className="switch-track" aria-hidden="true"><span className="switch-knob" /></span>
    </button>
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

const CLEARABLE_TYPES = new Set(['text', 'search', 'number', 'email', 'tel', 'url', 'password']);

/** Empties an input the way typing would, so the field's own onChange sees an empty value. */
function clearInput(el: HTMLInputElement | null): void {
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, '');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
}

export function TextField({ label, hint, error, unit, labelIcon, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null; unit?: ReactNode; labelIcon?: IconName }) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  // A cross clears the field in one tap; only for typed values, and only when there is something to clear.
  const clearable = CLEARABLE_TYPES.has(rest.type ?? 'text') && !rest.readOnly && !rest.disabled && rest.value !== undefined && String(rest.value) !== '';
  return (
    <div className="field">
      <label htmlFor={id}>{labelIcon && <Icon name={labelIcon} size={16} />}{label}</label>
      <div className="input-wrap">
        <input ref={ref} id={id} className={`input ${unit ? 'has-unit' : ''} ${clearable ? 'has-clear' : ''} ${error ? 'invalid' : ''} ${className}`} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-e` : undefined} {...rest} />
        {(clearable || unit) && (
          <span className="input-trail">
            {clearable && (
              <button type="button" className="input-clear" aria-label={`Очистить: ${label}`} onMouseDown={(e) => e.preventDefault()} onClick={() => clearInput(ref.current)}>
                <Icon name="close" size={14} strokeWidth={2.6} />
              </button>
            )}
            {unit && <span className="unit">{unit}</span>}
          </span>
        )}
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

/** A number field with − and + on the sides (weight, reps): big tap targets for use mid-set, typing still works. */
export function StepperField({ label, labelIcon, value, onChange, onStep, unit, inputMode = 'decimal', decLabel, incLabel, decDisabled }: { label: string; labelIcon?: IconName; value: string; onChange: (v: string) => void; onStep: (dir: -1 | 1) => void; unit?: ReactNode; inputMode?: 'decimal' | 'numeric'; decLabel: string; incLabel: string; decDisabled?: boolean }) {
  return (
    <div className="stepper">
      <IconButton icon="minus" label={decLabel} disabled={decDisabled} onClick={() => onStep(-1)} />
      <div className="grow">
        <TextField label={label} labelIcon={labelIcon} unit={unit} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      <IconButton icon="plus" label={incLabel} onClick={() => onStep(1)} />
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
  useScrollLock(open);
  // On a phone the on-screen keyboard covers the bottom of the screen: lift the sheet above it so the field being typed in stays visible.
  const [kb, setKb] = useState(0);
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setKb(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setKb(0);
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" style={kb > 0 ? { bottom: kb } : undefined} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grab" />
        <div className="row between sheet-head" style={{ marginBottom: 14 }}>
          <h2 className="t-h2">{title}</h2>
          <IconButton icon="close" label="Закрыть" tone="ghost" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** While a sheet is open the page behind it must not scroll (on iOS the page moved instead of the sheet). */
let locks = 0;
let lockedY = 0;
function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (locks === 0) {
      lockedY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${lockedY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
    }
    locks += 1;
    return () => {
      locks -= 1;
      if (locks === 0) {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        window.scrollTo(0, lockedY);
      }
    };
  }, [active]);
}

const SWIPE_W = 84;
const SWIPE_EVENT = 'fitapp-swipe-open';

/**
 * A list row that slides left to show a trash button (iOS style). Only one row is open at a time;
 * a tap on an open row closes it instead of opening it. Vertical scrolling is left to the page.
 */
export function SwipeToDelete({ children, label, onDelete, disabled }: { children: ReactNode; label: string; onDelete: () => void | Promise<void>; disabled?: boolean }) {
  const id = useId();
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const g = useRef<{ x: number; y: number; base: number; axis: 'x' | 'y' | null; moved: boolean } | null>(null);
  const openRef = useRef(false);
  openRef.current = offset !== 0;
  useEffect(() => {
    const onOther = (e: Event) => { if ((e as CustomEvent<string>).detail !== id) setOffset(0); };
    window.addEventListener(SWIPE_EVENT, onOther);
    return () => window.removeEventListener(SWIPE_EVENT, onOther);
  }, [id]);
  const start = (x: number, y: number) => { g.current = { x, y, base: offset, axis: null, moved: false }; };
  const move = (x: number, y: number, prevent: () => void) => {
    const s = g.current;
    if (!s || disabled) return;
    const dx = x - s.x;
    const dy = y - s.y;
    if (s.axis === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (s.axis === 'x') { setDragging(true); window.dispatchEvent(new CustomEvent(SWIPE_EVENT, { detail: id })); }
    }
    if (s.axis !== 'x') return;
    prevent();
    s.moved = true;
    const raw = s.base + dx;
    setOffset(raw > 0 ? 0 : raw < -SWIPE_W ? -SWIPE_W - (Math.abs(raw) - SWIPE_W) * 0.25 : raw);
  };
  const end = () => {
    const s = g.current;
    setDragging(false);
    if (s?.axis === 'x') setOffset((o) => (o < -SWIPE_W / 2 ? -SWIPE_W : 0));
    setTimeout(() => { g.current = null; }, 0);
  };
  const ref = useRef<HTMLDivElement>(null);
  // touchmove must be non-passive to stop the page from scrolling sideways while the row slides.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tm = (e: TouchEvent) => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY, () => { if (e.cancelable) e.preventDefault(); }); };
    el.addEventListener('touchmove', tm, { passive: false });
    return () => el.removeEventListener('touchmove', tm);
  });
  const reveal = Math.min(1, Math.abs(offset) / SWIPE_W);
  return (
    <div className="swipe-row" ref={ref}>
      <button type="button" className="swipe-del" aria-label={label} tabIndex={offset ? 0 : -1} style={{ opacity: reveal, pointerEvents: offset ? 'auto' : 'none' }} onClick={() => { setOffset(0); void onDelete(); }}>
        <Icon name="trash" size={22} />
      </button>
      <div
        className="swipe-front"
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? 'none' : 'transform .22s ease' }}
        onTouchStart={(e) => { const t = e.touches[0]; if (t) start(t.clientX, t.clientY); }}
        onTouchEnd={end}
        onTouchCancel={end}
        onMouseDown={(e) => { start(e.clientX, e.clientY); const mm = (ev: MouseEvent) => move(ev.clientX, ev.clientY, () => ev.preventDefault()); const mu = () => { end(); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); }; window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu); }}
        onClickCapture={(e) => {
          if (g.current?.moved) { e.preventDefault(); e.stopPropagation(); return; }
          if (openRef.current) { e.preventDefault(); e.stopPropagation(); setOffset(0); }
        }}
      >
        {children}
      </div>
    </div>
  );
}
