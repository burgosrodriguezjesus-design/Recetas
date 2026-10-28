// Componentes base reutilizables. Todos los controles táctiles miden ≥ 44 px.
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-strong',
  secondary: 'bg-card text-ink border border-line hover:bg-raised',
  ghost: 'text-ink hover:bg-raised',
  soft: 'bg-soft text-brand hover:brightness-95',
  danger: 'bg-danger text-white hover:brightness-110',
};

export function Button({
  variant = 'secondary',
  icon,
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: IconName; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'min-h-9 px-3 text-sm gap-1.5' : 'min-h-11 px-4 gap-2';
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${sz} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, className = '', variant = 'ghost', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; variant?: Variant }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-xl transition disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`print-plain rounded-2xl border border-line bg-card shadow-sm ${className}`} {...rest}>
      {children}
    </div>
  );
}

type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'accent';
const TONES: Record<Tone, string> = {
  neutral: 'bg-raised text-muted border border-line',
  brand: 'bg-soft text-brand',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  accent: 'bg-warn-soft text-accent',
};

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]} ${className}`}>{children}</span>;
}

// ───────────────────────── Formularios ─────────────────────────

const inputCls =
  'w-full min-h-11 rounded-xl border bg-card px-3 text-base text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60';

export function Field({ label, error, hint, children, htmlFor, className = '' }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ label, error, hint, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} htmlFor={id} className={className}>
      <input id={id} aria-invalid={!!error} className={`${inputCls} ${error ? 'border-danger' : 'border-line'}`} {...rest} />
    </Field>
  );
}

/** Campo numérico con teclado decimal en móvil. Guarda texto y se interpreta con parseDecimal. */
export function NumberInput({ label, error, hint, suffix, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; suffix?: string }) {
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} htmlFor={id} className={className}>
      <div className="relative">
        <input id={id} inputMode="decimal" autoComplete="off" aria-invalid={!!error} className={`${inputCls} tabular ${suffix ? 'pr-12' : ''} ${error ? 'border-danger' : 'border-line'}`} {...rest} />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">{suffix}</span>}
      </div>
    </Field>
  );
}

export function Select({ label, error, hint, className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} htmlFor={id} className={className}>
      <select id={id} className={`${inputCls} ${error ? 'border-danger' : 'border-line'}`} {...rest}>
        {children}
      </select>
    </Field>
  );
}

export function TextArea({ label, error, hint, className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} htmlFor={id} className={className}>
      <textarea id={id} className={`${inputCls} min-h-24 py-2 ${error ? 'border-danger' : 'border-line'}`} {...rest} />
    </Field>
  );
}

export function Checkbox({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm">
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-raised p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-9 rounded-lg px-3 text-sm font-medium transition ${value === o.value ? 'bg-card text-ink shadow-sm' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 99, step = 1, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-card" role="group" aria-label={label}>
      <IconButton icon="minus" label={`Menos ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} />
      <span className="tabular min-w-8 text-center font-semibold" aria-live="polite">
        {value}
      </span>
      <IconButton icon="plus" label={`Más ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} />
    </div>
  );
}

// ───────────────────────── Diálogo ─────────────────────────

export function Dialog({ open, onClose, title, children, footer, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const handler = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    d.addEventListener('cancel', handler);
    return () => d.removeEventListener('cancel', handler);
  }, []);
  if (!open) return <dialog ref={ref} className={`sheet ${wide ? 'wide' : ''}`} />;
  return (
    <dialog
      ref={ref}
      className={`sheet ${wide ? 'wide' : ''}`}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <IconButton icon="x" label="Cerrar" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="pb-safe flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </dialog>
  );
}

// ───────────────────────── Estados ─────────────────────────

export function EmptyState({ icon = 'info', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <div className="rounded-full bg-soft p-3 text-brand">
        <Icon name={icon} size={26} />
      </div>
      <h3 className="font-semibold">{title}</h3>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-brand" />
      {label}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Notice({ tone = 'warn', children, icon = 'info' }: { tone?: 'warn' | 'danger' | 'ok' | 'brand'; children: ReactNode; icon?: IconName }) {
  const cls = { warn: 'bg-warn-soft text-warn', danger: 'bg-danger-soft text-danger', ok: 'bg-ok-soft text-ok', brand: 'bg-soft text-brand' }[tone];
  return (
    <div className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${cls}`}>
      <Icon name={icon} size={18} className="mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'ok' | 'danger' | 'warn' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-ink';
  return (
    <div className="min-w-0 rounded-xl bg-raised px-3 py-2">
      <div className="truncate text-xs text-muted">{label}</div>
      <div className={`tabular text-lg font-semibold ${color}`}>{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}
