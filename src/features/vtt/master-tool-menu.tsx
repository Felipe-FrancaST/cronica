'use client';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  Box,
  Hand,
  Mountain,
  Eye,
  Users,
  SlidersHorizontal,
  ChevronRight,
} from 'lucide-react';

const tools = [
  { id: 'objects', title: 'Objetos', description: 'Colocar, ajustar e organizar peças', icon: Box },
  {
    id: 'interactions',
    title: 'Interações',
    description: 'Luzes, portas, baús e mecanismos',
    icon: Hand,
  },
  { id: 'terrain', title: 'Terreno', description: 'Pintar caminhos e obstáculos', icon: Mountain },
  {
    id: 'visibility',
    title: 'Luz e visão',
    description: 'Dia, noite, névoa e áreas ocultas',
    icon: Eye,
  },
  {
    id: 'participants',
    title: 'Participantes',
    description: 'Adicionar personagens e NPCs',
    icon: Users,
  },
  {
    id: 'rules',
    title: 'Regras da mesa',
    description: 'Turnos e limites de movimento',
    icon: SlidersHorizontal,
  },
] as const;
export type MasterToolId = (typeof tools)[number]['id'];

/** Mount a tool on first use; retain its draft while another tool is open. */
export function MasterToolMenu({
  active,
  onChange,
  children,
}: {
  active: MasterToolId | null;
  onChange(tool: MasterToolId | null): void;
  children: Record<MasterToolId, ReactNode>;
}) {
  const id = useId();
  const [visited, setVisited] = useState<MasterToolId[]>([]);
  const triggers = useRef(new Map<MasterToolId, HTMLButtonElement>());
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(active);
  const tool = tools.find((item) => item.id === active);
  useEffect(() => {
    if (active) {
      setVisited((current) => (current.includes(active) ? current : [...current, active]));
      heading.current?.focus({ preventScroll: true });
    } else if (previous.current)
      triggers.current.get(previous.current)?.focus({ preventScroll: true });
    previous.current = active;
  }, [active]);
  return (
    <div
      className="vtt-master-menu"
      onKeyDown={(event) => {
        if (
          active &&
          event.key === 'Escape' &&
          !event.defaultPrevented &&
          !(event.target instanceof HTMLSelectElement)
        ) {
          event.preventDefault();
          event.stopPropagation();
          onChange(null);
        }
      }}
    >
      <div className="vtt-master-launcher" hidden={!!active}>
        <p className="vtt-master-menu-hint">O que você quer fazer no mapa?</p>
        <div className="vtt-master-tool-grid" role="group" aria-label="Ferramentas do mestre">
          {tools.map(({ id: key, title, description, icon: Icon }) => (
            <button
              key={key}
              ref={(node) => {
                if (node) triggers.current.set(key, node);
                else triggers.current.delete(key);
              }}
              type="button"
              aria-label={`Abrir ${title}`}
              aria-expanded={active === key}
              aria-controls={`${id}-${key}`}
              onClick={() => onChange(key)}
            >
              <Icon size={20} aria-hidden="true" />
              <strong>{title}</strong>
              <small>{description}</small>
              <ChevronRight size={13} className="vtt-master-card-arrow" aria-hidden="true" />
            </button>
          ))}
        </div>
        <small className="vtt-master-menu-hint">
          Abra uma ferramenta por vez. Você também pode tocar nas peças do mapa.
        </small>
      </div>
      {tool && (
        <div className="vtt-master-tool-heading">
          <button
            type="button"
            className="vtt-master-back"
            aria-label="Voltar às ferramentas do mestre"
            onClick={() => onChange(null)}
          >
            <ArrowLeft size={15} /> Ferramentas
          </button>
          <h3 ref={heading} tabIndex={-1}>
            {tool.title}
          </h3>
          <p>{tool.description}</p>
        </div>
      )}
      {tools.map(({ id: key, title }) => (
        <section
          id={`${id}-${key}`}
          key={key}
          className="vtt-master-tool-body"
          aria-label={`Ferramenta: ${title}`}
          hidden={active !== key}
        >
          {(active === key || visited.includes(key)) && children[key]}
        </section>
      ))}
    </div>
  );
}

export function toolTabKey(event: KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const current = tabs.indexOf(event.target as HTMLButtonElement);
  if (current < 0) return;
  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next]?.click();
  tabs[next]?.focus();
}

export function ToolPagination({
  page,
  total,
  size,
  onPage,
  label,
}: {
  page: number;
  total: number;
  size: number;
  onPage(page: number): void;
  label: string;
}) {
  if (total <= size) return null;
  return (
    <nav className="vtt-tool-pagination" aria-label={`Paginação de ${label}`}>
      <button
        type="button"
        disabled={page === 0}
        aria-label={`Página anterior de ${label}`}
        onClick={() => onPage(page - 1)}
      >
        Anterior
      </button>
      <span>
        {page * size + 1}–{Math.min(total, (page + 1) * size)} de {total}
      </span>
      <button
        type="button"
        disabled={(page + 1) * size >= total}
        aria-label={`Próxima página de ${label}`}
        onClick={() => onPage(page + 1)}
      >
        Próxima
      </button>
    </nav>
  );
}
