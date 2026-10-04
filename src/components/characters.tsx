'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, Trash2, ScrollText } from 'lucide-react';
import type { Campaign, Character } from '@/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { getSystem } from '@/systems/registry';
import { SystemCharacterEditor } from '@/systems/character-editor';
import { Button, Modal, Confirm, Empty, ErrorBox, Field, Select, Input, Badge } from './ui';
import { PageHeading } from './shell';
import { Avatar } from './media';
import { uid, now, errorMessage } from '@/lib/utils';
export function CharacterCollection({ campaign }: { campaign?: Campaign }) {
  const w = useWorkspace(),
    params = useSearchParams();
  const [editing, setEditing] = useState<Character | null>(null),
    [choosing, setChoosing] = useState(false),
    [selectedCampaign, setSelectedCampaign] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Character | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState('');
  const records = w.data.characters
    .filter(
      (c) =>
        (!campaign || c.campaign_id === campaign.id) &&
        (w.mode === 'master' || c.owner_id === w.user?.id),
    )
    .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
  const accessible = w.data.campaigns.filter(
    (c) =>
      c.owner_id === w.user?.id ||
      w.data.members.some((m) => m.campaign_id === c.id && m.user_id === w.user?.id),
  );
  function create(c: Campaign) {
    const module = getSystem(w.data.systems.find((s) => s.id === c.rpg_system_id)?.slug || 'dnd5e');
    setChoosing(false);
    setEditing({
      id: uid(),
      campaign_id: c.id,
      owner_id: w.user!.id,
      rpg_system_id: c.rpg_system_id,
      name: '',
      portrait_path: null,
      appearance: '',
      biography: '',
      sheet: module.defaultSheet(),
      created_at: now(),
      updated_at: now(),
    });
  }
  function start() {
    if (campaign) create(campaign);
    else {
      setSelectedCampaign(accessible[0]?.id || '');
      setChoosing(true);
    }
  }
  useEffect(() => {
    if (params.get('criar') === '1' && w.user && w.data.systems.length) start();
  }, [params, w.user?.id, w.data.systems.length]);
  async function remove() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await w.perform((r) => r.deleteCharacter(pendingDelete.id), 'Personagem excluído.');
      setPendingDelete(null);
    } catch (e) {
      setError(errorMessage(e));
      setPendingDelete(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={campaign?.name || 'OS ROSTOS DA SUA AVENTURA'}
        title={w.mode === 'master' ? 'Personagens' : 'Meus personagens'}
        description="Fichas vivas para histórias que merecem ser contadas."
        action={
          <Button onClick={start}>
            <Plus size={18} />
            Criar personagem
          </Button>
        }
      />
      <ErrorBox message={error} />
      <div className="collection-toolbar">
        <span className="subtle">{records.length} personagens</span>
        <label className="search-field">
          <Search size={17} />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar personagem..."
            aria-label="Buscar personagem"
          />
        </label>
      </div>
      {records.length ? (
        <div className="campaign-grid">
          {records.map((c) => {
            const module = getSystem(
              w.data.systems.find((s) => s.id === c.rpg_system_id)?.slug || 'dnd5e',
            );
            const d = module.calculate(c.sheet),
              summary = module.describeSheet(c.sheet);
            const owner = w.data.profiles.find((p) => p.id === c.owner_id);
            return (
              <article key={c.id} className="character-card">
                <div className="character-card-top">
                  <Avatar name={c.name} path={c.portrait_path} />
                  <div>
                    <h3>{c.name}</h3>
                    <small>
                      {summary.ancestry} · {summary.profession}
                    </small>
                  </div>
                </div>
                <Badge>Nível {c.sheet.level}</Badge>
                <span className="character-hp">
                  Pontos de vida · {c.sheet.hp_current} / {d.hpMax}
                  <div className="hp-bar">
                    <span
                      style={{ width: `${Math.min(100, (c.sheet.hp_current / d.hpMax) * 100)}%` }}
                    />
                  </div>
                </span>
                <div className="card-counts">
                  <span>CA {d.armorClass}</span>
                  <span>{c.sheet.xp} XP</span>
                </div>
                <div className="record-card-footer">
                  <small>{owner?.name || 'Jogador'}</small>
                  <div className="record-actions">
                    <Button variant="secondary" onClick={() => setEditing(c)}>
                      Abrir ficha
                    </Button>
                    <button
                      className="icon-button"
                      aria-label={`Excluir ${c.name}`}
                      onClick={() => setPendingDelete(c)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title="Nenhum personagem nestas páginas."
          description="Crie uma ficha e dê vida a um novo aventureiro."
          action={
            <Button onClick={start}>
              <Plus size={18} />
              Criar personagem
            </Button>
          }
        />
      )}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.name || 'Criar personagem'}
        description="D&D 5e · 2014 + suplementos"
        wide
      >
        {editing && (
          <SystemCharacterEditor
            slug={w.data.systems.find((s) => s.id === editing.rpg_system_id)?.slug || 'dnd5e'}
            key={editing.id}
            character={editing}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
      <Modal
        open={choosing}
        onClose={() => setChoosing(false)}
        title="Escolha sua aventura"
        description="Vincule a ficha a uma campanha."
      >
        {accessible.length ? (
          <div className="form-stack">
            <Field label="Campanha">
              <Select
                value={selectedCampaign}
                onChange={(e) => setSelectedCampaign(e.target.value)}
              >
                {accessible.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="form-actions">
              <Button
                onClick={() => {
                  const c = accessible.find((c) => c.id === selectedCampaign);
                  if (c) create(c);
                }}
              >
                Continuar
              </Button>
            </div>
          </div>
        ) : (
          <Empty
            title="Você ainda não tem uma campanha."
            description="Crie uma campanha como mestre ou peça para um mestre adicionar seu email."
          />
        )}
      </Modal>
      <Confirm
        open={Boolean(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void remove()}
        title={`Excluir ${pendingDelete?.name}?`}
        description="A ficha e seus equipamentos e magias serão excluídos. Esta ação não pode ser desfeita."
        busy={busy}
      />
    </>
  );
}
