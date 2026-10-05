'use client';
import type {
  ReactNode,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cloneElement, isValidElement, useId, type ReactElement } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertPrimitive from '@radix-ui/react-alert-dialog';
import { X, LoaderCircle, BookOpen, AlertCircle, Check } from 'lucide-react';
import { cx } from '@/lib/utils';
export function Button({
  children,
  variant = 'gold',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'gold' | 'secondary' | 'ghost' | 'danger';
}) {
  return (
    <button className={cx('button', `button-${variant}`, className)} {...props}>
      {children}
    </button>
  );
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('input', props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx('input select', props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} className={cx('input textarea', props.className)} />;
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const child = isValidElement(children)
    ? (children as ReactElement<{ id?: string; 'aria-describedby'?: string }>)
    : null;
  const id = child?.props.id ?? generatedId;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {child
        ? cloneElement(child, {
            id,
            'aria-describedby': hint ? `${id}-hint` : child.props['aria-describedby'],
          })
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Badge({
  children,
  tone = 'gold',
}: {
  children: ReactNode;
  tone?: 'gold' | 'blue' | 'green' | 'muted' | 'red';
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
  portalContainer,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  portalContainer?: HTMLElement | null;
}) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogPrimitive.Portal container={portalContainer ?? undefined}>
        <DialogPrimitive.Overlay className="modal-overlay" />
        <DialogPrimitive.Content className={cx('modal-content', wide && 'modal-wide')}>
          <div className="modal-heading">
            <div>
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className={description ? '' : 'sr-only'}>
                {description || 'Preencha os campos e salve suas alterações.'}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="icon-button" aria-label="Fechar">
              <X size={20} />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
export function Confirm({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  busy = false,
}: {
  open: boolean;
  onCancel(): void;
  onConfirm(): void;
  title: string;
  description: string;
  busy?: boolean;
}) {
  return (
    <AlertPrimitive.Root
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onCancel();
      }}
    >
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className="modal-overlay" />
        <AlertPrimitive.Content className="modal-content confirm-content">
          <AlertPrimitive.Title>{title}</AlertPrimitive.Title>
          <AlertPrimitive.Description>{description}</AlertPrimitive.Description>
          <div className="form-actions">
            <AlertPrimitive.Cancel asChild>
              <Button variant="secondary" disabled={busy}>
                Cancelar
              </Button>
            </AlertPrimitive.Cancel>
            <Button variant="danger" disabled={busy} onClick={onConfirm}>
              {busy && <LoaderCircle size={17} className="spin" />}Confirmar exclusão
            </Button>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
export function Empty({
  title = 'Seu livro ainda está em branco.',
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <BookOpen size={36} />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={24} />
      <p>Consultando os registros da aventura...</p>
    </div>
  );
}
export function ErrorBox({ message }: { message: string | null }) {
  return message ? (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function SuccessBox({ message }: { message: string | null }) {
  return message ? (
    <div className="success-box" role="status">
      <Check size={18} />
      <span>{message}</span>
    </div>
  ) : null;
}
