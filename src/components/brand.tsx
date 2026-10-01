import { Hexagon, Sword } from 'lucide-react';
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Hexagon size={38} strokeWidth={1} />
        <Sword size={21} strokeWidth={1.4} />
      </span>
      {!compact && (
        <div>
          <strong>CRÔNICA</strong>
          <small>LIVRO DE AVENTURAS</small>
        </div>
      )}
    </div>
  );
}
