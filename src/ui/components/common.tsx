import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { goBack } from '../../app/router';
import { store, useStore } from '../../app/store';
import { IconAlert, IconArrowLeft, IconCheck, IconInfo } from '../icons';

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function BackHeader({ title, eyebrow, fallback = '/', right }: { title: ReactNode; eyebrow?: ReactNode; fallback?: string; right?: ReactNode }) {
  return (
    <header className="screen-head with-back">
      <button type="button" className="icon-btn" onClick={() => goBack(fallback)} aria-label="Retour">
        <IconArrowLeft />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="title-sm">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  // Rendered at body level so no ancestor stacking context can trap it under the tab bar.
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="sheet-grip" />
        {children}
      </div>
    </>,
    document.body,
  );
}

export function Ring({ value, size = 132, stroke = 10, children }: { value: number | null; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value ?? 0;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ring-grad)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.9s var(--ease)' }}
        />
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5cf0b0" />
            <stop offset="100%" stopColor="#1fae74" />
          </linearGradient>
        </defs>
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export function SaveIndicator() {
  const save = useStore((s) => s.save);
  const err = useStore((s) => s.saveError);
  if (save === 'error')
    return (
      <button type="button" className="save-pill error" onClick={() => store.retrySave()} title={err ?? undefined}>
        <i /> Sauvegarde impossible · réessayer
      </button>
    );
  if (save === 'saving')
    return (
      <span className="save-pill saving">
        <i /> Enregistrement…
      </span>
    );
  if (save === 'saved')
    return (
      <span className="save-pill">
        <i /> Progression enregistrée
      </span>
    );
  return null;
}

/** Shown only when saving fails, so the problem is never silent. */
export function SaveErrorBanner() {
  const save = useStore((s) => s.save);
  const err = useStore((s) => s.saveError);
  if (save !== 'error') return null;
  return (
    <div className="banner banner-error" style={{ marginBottom: 12 }}>
      <IconAlert />
      <div>
        <strong>La progression n’a pas pu être enregistrée.</strong>
        <p style={{ marginTop: 2 }}>{err}</p>
        <button type="button" className="link-btn" onClick={() => store.retrySave()}>
          Réessayer
        </button>
      </div>
    </div>
  );
}

export function ToastHost() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className={`toast ${toast.kind}`} role="status" aria-live="polite" onClick={() => store.dismissToast()}>
      {toast.kind === 'error' ? <IconAlert /> : toast.kind === 'success' ? <IconCheck /> : <IconInfo />}
      <span>{toast.text}</span>
    </div>
  );
}

export function SampleNote({ n }: { n: number }) {
  return <span className="faint" style={{ fontSize: 12 }}>{n < 10 ? `${n} rép. · peu de données` : `${n} rép.`}</span>;
}
