import { useEffect } from 'react';

export type ToastAction = {
  label: string;
  onClick: () => void;
};

type Props = {
  message: string;
  action?: ToastAction;
  onDismiss: () => void;
  /** Auto-dismiss ms; 0 = no auto dismiss. Default 5000. */
  durationMs?: number;
};

export function Toast({
  message,
  action,
  onDismiss,
  durationMs = 5000,
}: Props) {
  useEffect(() => {
    if (durationMs <= 0) return;
    const t = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(t);
  }, [durationMs, onDismiss]);

  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast-message">{message}</span>
      {action && (
        <button type="button" className="toast-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      <button
        type="button"
        className="toast-dismiss"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
