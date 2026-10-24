'use client';
import type {
  ReactNode,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  KeyboardEvent,
} from 'react';
import {
  Children,
  Fragment,
  useState,
  cloneElement,
  isValidElement,
  useId,
  useRef,
  useEffect,
  type ReactElement,
} from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertPrimitive from '@radix-ui/react-alert-dialog';
import { X, LoaderCircle, BookOpen, AlertCircle, Check, Search } from 'lucide-react';
import { cx } from '@/lib/utils';
import { useActionNotice, useActionNoticeAvailable, BlockedActionScope } from './action-notice';
export function Button({
  children,
  variant = 'gold',
  className,
  disabled,
  disabledReason,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'gold' | 'secondary' | 'ghost' | 'danger';
  disabledReason?: string | null;
}) {
  const announce = useActionNotice();
  const reason =
    disabledReason || props.title || 'Aguarde a operação atual terminar para tentar novamente.';
  return (
    <button
      className={cx('button', `button-${variant}`, className)}
      {...props}
      type={disabled ? 'button' : props.type}
      aria-disabled={disabled || undefined}
      title={disabled ? reason : props.title}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          event.stopPropagation();
          announce(reason);
          return;
        }
        onClick?.(event);
      }}
    >
      {children}
    </button>
  );
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('input', props.className)} />;
}
const optionOrder = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
function optionText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (isValidElement<{ children?: ReactNode }>(node)) return optionText(node.props.children);
  return Children.toArray(node).map(optionText).join('');
}
export function sortedOptions(children: ReactNode): ReactNode[] {
  return Children.toArray(children)
    .flatMap((n) =>
      isValidElement<{ children?: ReactNode }>(n) && n.type === Fragment
        ? sortedOptions(n.props.children)
        : [n],
    )
    .map((n) =>
      isValidElement<{ children?: ReactNode }>(n) && n.type === 'optgroup'
        ? cloneElement(n, {}, sortedOptions(n.props.children))
        : n,
    )
    .sort((a, b) => {
      const placeholder = (n: ReactNode) =>
        isValidElement<{ value?: unknown }>(n) && n.type === 'option' && n.props.value === '';
      if (placeholder(a) !== placeholder(b)) return placeholder(a) ? -1 : 1;
      const label = (n: ReactNode) =>
        isValidElement<{ label?: string }>(n) && n.type === 'optgroup'
          ? (n.props.label ?? '')
          : optionText(n);
      return optionOrder.compare(label(a), label(b));
    });
}
export function Select({
  children,
  searchable = true,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  searchable?: boolean;
  'data-select-label'?: string;
}) {
  const [query, setQuery] = useState(''),
    [searching, setSearching] = useState(false),
    searchId = useId(),
    label = props['data-select-label'] ?? props['aria-label'] ?? 'opções';
  const normalize = (v: string) =>
      v
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR'),
    options = sortedOptions(children);
  const count = (nodes: ReactNode[]): number =>
    nodes.reduce<number>(
      (n, node) =>
        n +
        (isValidElement<{ children?: ReactNode }>(node) && node.type === 'optgroup'
          ? count(Children.toArray(node.props.children))
          : 1),
      0,
    );
  const filter = (nodes: ReactNode[], group = ''): ReactNode[] =>
    nodes.flatMap((node) => {
      if (!isValidElement<{ children?: ReactNode; label?: string; value?: unknown }>(node))
        return [node];
      if (node.type === 'optgroup') {
        const nested = filter(Children.toArray(node.props.children), node.props.label);
        return nested.length ? [cloneElement(node, {}, nested)] : [];
      }
      return node.props.value === '' ||
        String(node.props.value) === String(props.value) ||
        normalize(group + ' ' + optionText(node)).includes(normalize(query))
        ? [node]
        : [];
    });
  const select = (
    <select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        setQuery('');
      }}
      className={cx('input select', props.className)}
    >
      {query ? filter(options) : options}
    </select>
  );
  if (!searchable || count(options) < 12) return select;
  return (
    <div className="search-select">
      <div className="search-select-row">
        {select}
        <button
          type="button"
          className="icon-button"
          aria-label={`Pesquisar ${label}`}
          aria-expanded={searching}
          aria-controls={searchId}
          disabled={props.disabled}
          onClick={() => {
            setSearching((v) => !v);
            setQuery('');
          }}
        >
          <Search size={17} />
        </button>
      </div>
      {searching && (
        <input
          id={searchId}
          className="input"
          type="search"
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault();
          }}
          aria-label={`Filtrar ${label}`}
          placeholder="Pesquisar opções…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
    </div>
  );
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} className={cx('input textarea', props.className)} />;
}
export function Tabs({
  items,
  value,
  onChange,
  label,
  idPrefix,
  panelId,
}: {
  items: readonly { id: string; label: string }[];
  value: string;
  onChange(value: string): void;
  label: string;
  idPrefix: string;
  panelId: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % items.length;
        break;
      case 'ArrowLeft':
        next = (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(items[next].id);
    buttons.current[next]?.focus();
  }
  return (
    <div className="tabs-bar" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          type="button"
          role="tab"
          id={`${idPrefix}-${item.id}`}
          aria-controls={panelId}
          aria-selected={value === item.id}
          tabIndex={value === item.id ? 0 : -1}
          className="tab-button"
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => navigate(event, index)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
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
    ? (children as ReactElement<{
        id?: string;
        'aria-describedby'?: string;
        'data-select-label'?: string;
      }>)
    : null;
  const id = child?.props.id ?? generatedId;
  return (
    <BlockedActionScope
      className="field"
      reason={
        hint ||
        'Este campo está bloqueado pelas permissões da ficha, por uma escolha anterior ou pelas regras da campanha.'
      }
    >
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {child
        ? cloneElement(child, {
            id,
            ...(child.type === Select ? { 'data-select-label': label } : {}),
            'aria-describedby':
              [child.props['aria-describedby'], hint ? `${id}-hint` : undefined]
                .filter(Boolean)
                .join(' ') || undefined,
          })
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </BlockedActionScope>
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
        <DialogPrimitive.Content
          className={cx('modal-content', wide && 'modal-wide')}
          onInteractOutside={(event) => {
            // Notices are portaled above dialogs. Closing one must not dismiss the editor.
            if (event.target instanceof Element && event.target.closest('[data-action-notice]'))
              event.preventDefault();
          }}
        >
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
  confirmLabel = 'Confirmar exclusão',
}: {
  open: boolean;
  onCancel(): void;
  onConfirm(): void;
  title: string;
  description: string;
  busy?: boolean;
  confirmLabel?: string;
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
              {busy && <LoaderCircle size={17} className="spin" />}
              {confirmLabel}
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
  const announce = useActionNotice();
  const centered = useActionNoticeAvailable();
  useEffect(() => {
    if (message) announce(message, 'error');
  }, [message, announce]);
  return message && !centered ? (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function SuccessBox({ message }: { message: string | null }) {
  const announce = useActionNotice();
  const centered = useActionNoticeAvailable();
  useEffect(() => {
    if (message) announce(message, 'success');
  }, [message, announce]);
  return message && !centered ? (
    <div className="success-box" role="status">
      <Check size={18} />
      <span>{message}</span>
    </div>
  ) : null;
}
