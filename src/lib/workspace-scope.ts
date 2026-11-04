import type { WorkspaceLoadOptions, WorkspaceSection } from '@/types';

export function workspaceScope(path: string): WorkspaceLoadOptions {
  const match = path.match(/^\/campanhas\/([\da-f-]{36})(?:\/(.*))?$/i);
  if (match) {
    const section = match[2]?.split('/')[0] ?? '';
    const sections: WorkspaceSection[] =
      section === 'personagens'
        ? ['characters']
        : section === 'npcs'
          ? ['npcs']
          : ['mundo', 'locais'].includes(section)
            ? ['world']
            : section === 'mesa' || section === ''
              ? ['characters', 'npcs', 'world']
              : section === 'sessoes'
                ? ['characters', 'npcs']
                : ['jogadores', 'itens'].includes(section)
                  ? ['characters']
                  : [];
    return { campaignId: match[1], sections };
  }
  const section = ({ personagens: 'characters', npcs: 'npcs', mundo: 'world' } as const)[
    path.split('/')[1] as 'personagens' | 'npcs' | 'mundo'
  ];
  return { sections: section ? [section] : [] };
}
