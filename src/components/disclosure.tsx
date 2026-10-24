import type { ReactNode } from 'react';
import { ChevronDown, Info } from 'lucide-react';
export function Disclosure({
  title,
  children,
  iconOnly = false,
}: {
  title: string;
  children: ReactNode;
  iconOnly?: boolean;
}) {
  return (
    <details className={`compact-disclosure${iconOnly ? ' info-disclosure' : ''}`}>
      <summary aria-label={title} title={title}>
        {iconOnly ? <Info size={18} /> : <span>{title}</span>}
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="disclosure-content">{children}</div>
    </details>
  );
}
