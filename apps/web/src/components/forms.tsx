'use client';
import { createContext, useActionState, useContext, useState, useRef } from 'react';
import { ArrowRight, Plus, X, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ActionState } from '@/lib/actions';
import { useRouter } from 'next/navigation';
type Action = (state: ActionState, form: FormData) => Promise<ActionState>;
const CompleteDialog = createContext<((message: string) => void) | null>(null);
const Notify = createContext<((message: string) => void) | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState('');
  return (
    <Notify.Provider value={setMessage}>
      {children}
      {message && (
        <div className="success-toast" role="status">
          <span>{message}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setMessage('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </Notify.Provider>
  );
}

export function ActionForm({
  action,
  children,
  label = 'Save changes',
  className = '',
  destructive = false,
}: {
  action: Action;
  children?: React.ReactNode;
  label?: string;
  className?: string;
  destructive?: boolean;
}) {
  const complete = useContext(CompleteDialog);
  const router = useRouter();
  const [state, dispatch, pending] = useActionState(
    async (previous: ActionState, form: FormData) => {
      const result = await action(previous, form);
      if (result.success && !result.error && !result.invite && !result.link)
        complete?.(result.success);
      if (
        result.success &&
        result.redirectTo?.startsWith('/') &&
        !result.redirectTo.startsWith('//')
      )
        router.push(result.redirectTo);
      return result;
    },
    {},
  );
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
      {state.link && (
        <a href={state.link} target="_blank" rel="noreferrer" className="back-link">
          Open pull request on GitHub <ArrowRight size={14} />
        </a>
      )}
      <button
        className={`button ${destructive ? 'destructive' : 'primary'}`}
        disabled={pending || Boolean(state.link)}
      >
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
  destructive = false,
}: {
  title: string;
  trigger: string;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const notify = useContext(Notify);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  function closeDialog() {
    dialogRef.current?.close();
    setOpen(false);
    triggerRef.current?.focus();
  }
  return (
    <>
      <button
        ref={triggerRef}
        className={`button ${destructive ? 'destructive' : 'primary'}`}
        onClick={() => setOpen(true)}
      >
        {destructive ? <TriangleAlert size={16} /> : <Plus size={16} />}
        {trigger}
      </button>
      {open && (
        <dialog
          open
          aria-modal="true"
          aria-label={title}
          ref={(node) => {
            dialogRef.current = node;
            if (node && !node.dataset.ready) {
              node.dataset.ready = 'true';
              node.close();
              node.showModal();
            }
          }}
          onCancel={closeDialog}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDialog();
          }}
        >
          <div className="dialog-body">
            <header>
              <h2>{title}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close dialog"
                onClick={closeDialog}
              >
                <X size={20} />
              </button>
            </header>
            <CompleteDialog.Provider
              value={(message) => {
                closeDialog();
                notify?.(message);
              }}
            >
              {children}
            </CompleteDialog.Provider>
          </div>
        </dialog>
      )}
    </>
  );
}
