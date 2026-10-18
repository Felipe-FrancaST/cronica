import { Hexagon, Sword } from 'lucide-react';
export function Brand({ compact = false, name = 'Crônica' }: { compact?: boolean; name?: string }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Hexagon size={38} strokeWidth={1} />
        <Sword size={21} strokeWidth={1.4} />
      </span>
      {!compact && (
        <div>
          <strong>{name.toUpperCase()}</strong>
          <small>LIVRO DE AVENTURAS</small>
        </div>
      )}
    </div>
  );
}
