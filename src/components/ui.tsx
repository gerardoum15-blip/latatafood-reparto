import { useEffect, type ReactNode } from 'react';
import type { Status } from '../types';
import { STATUS_LABEL } from '../lib';

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    document.body.classList.add('no-scroll');
    return () => { document.removeEventListener('keydown', k); document.body.classList.remove('no-scroll'); };
  }, [onClose]);
  return (
    <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export const Badge = ({ status }: { status: Status }) => <span className={`badge st-${status}`}>{STATUS_LABEL[status]}</span>;

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="muted small">{hint}</span>}
    </label>
  );
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
/** Aviso corto abajo de la pantalla. */
export function toast(text: string, kind: 'ok' | 'err' = 'ok') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = text; el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el!.className = 'toast'; }, 3200);
}

export async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast('Enlace copiado'); }
  catch { window.prompt('Copia el enlace:', text); }
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
