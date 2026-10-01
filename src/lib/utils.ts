export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const cx = (...values: (string | false | null | undefined)[]) =>
  values.filter(Boolean).join(' ');
export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
export const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
export const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : 'Não foi possível concluir esta ação. Tente novamente.';
