// Notificaciones (toasts con "Deshacer") y confirmaciones antes de borrar.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button, Dialog } from './kit';
import { Icon } from './Icon';
import { ValidationError } from '../db/common';

type ToastType = 'ok' | 'error' | 'info';
interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: { label: string; onClick: () => void | Promise<void> };
}

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface FeedbackApi {
  toast: (message: string, opts?: { type?: ToastType; action?: Toast['action']; duration?: number }) => void;
  /** Muestra el error de forma legible (los de validación tal cual; los inesperados, genéricos). */
  error: (e: unknown) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useFeedback fuera de FeedbackProvider');
  return c;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ValidationError) return e.message;
  if (e instanceof Error && e.name === 'QuotaExceededError') return 'No queda espacio de almacenamiento en el dispositivo.';
  if (e instanceof Error) return `Ha ocurrido un error: ${e.message}`;
  return 'Ha ocurrido un error inesperado.';
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback<FeedbackApi['toast']>(
    (message, opts = {}) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, message, type: opts.type ?? 'ok', action: opts.action }]);
      setTimeout(() => dismiss(id), opts.duration ?? (opts.action ? 7000 : 4000));
    },
    [dismiss],
  );

  const error = useCallback<FeedbackApi['error']>(
    (e) => {
      if (!(e instanceof ValidationError)) console.error(e);
      toast(errorMessage(e), { type: 'error', duration: 6000 });
    },
    [toast],
  );

  const confirm = useCallback<FeedbackApi['confirm']>((opts) => new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })), []);

  const close = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  return (
    <Ctx.Provider value={{ toast, error, confirm }}>
      {children}
      <Dialog
        open={!!confirmState}
        onClose={() => close(false)}
        title={confirmState?.title ?? ''}
        footer={
          <>
            <Button onClick={() => close(false)}>Cancelar</Button>
            <Button variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {confirmState?.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        <div className="text-sm text-muted">{confirmState?.message}</div>
      </Dialog>
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ${
              t.type === 'error' ? 'bg-danger text-white' : 'bg-ink text-bg'
            }`}
          >
            <Icon name={t.type === 'error' ? 'alert' : t.type === 'info' ? 'info' : 'check'} size={18} />
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="rounded-lg px-2 py-1 font-semibold underline underline-offset-2"
                onClick={async () => {
                  dismiss(t.id);
                  await t.action!.onClick();
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" aria-label="Cerrar aviso" className="opacity-70" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
