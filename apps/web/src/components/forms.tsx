'use client';
import { useActionState, useState } from 'react';
import { ArrowRight, Plus, X, LoaderCircle } from 'lucide-react';
import type { ActionState } from '@/lib/actions';
type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  children,
  label = 'Save changes',
  className = '',
}: {
  action: Action;
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  return (
    <form action={dispatch} className={`form ${className}`}>
      {children}
      {state.error && (
        <p role="alert" className="feedback error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="feedback success">
          {state.success}
        </p>
      )}
      {state.invite && (
        <label>
          Invitation link
          <input
            readOnly
            value={
              typeof window === 'undefined'
                ? state.invite
                : `${window.location.origin}${state.invite}`
            }
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}
      <button className="button primary" disabled={pending}>
        {pending ? <LoaderCircle size={16} className="spin" /> : null}
        {pending ? 'Working…' : label}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
export function Dialog({
  title,
  trigger,
  children,
}: {
  title: string;
  trigger: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="button primary" onClick={() => setOpen(true)}>
        <Plus size={16} />
        {trigger}
      </button>
      {open && (
        <dialog
          open
          aria-modal="true"
          aria-label={title}
          ref={(node) => {
            if (node && !node.dataset.ready) {
              node.dataset.ready = 'true';
              node.close();
              node.showModal();
            }
          }}
          onCancel={() => setOpen(false)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="dialog-body">
            <header>
              <h2>{title}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close dialog"
                onClick={() => setOpen(false)}
              >
                <X size={20} />
              </button>
            </header>
            {children}
          </div>
        </dialog>
      )}
    </>
  );
}
