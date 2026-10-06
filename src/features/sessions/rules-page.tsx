'use client';
import { useState, type FormEvent } from 'react';
import { Shield, Save, LoaderCircle } from 'lucide-react';
import type { Campaign } from '@/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { PageHeading } from '@/components/shell';
import { Button, Field, Input, ErrorBox, Badge } from '@/components/ui';
import { errorMessage } from '@/lib/utils';
import { defaultRules, type CampaignRules } from './types';
import { saveRules } from './repository';
export function RulesPage({ campaign }: { campaign: Campaign }) {
  const w = useWorkspace(),
    rules = w.data.rules?.find((r) => r.campaign_id === campaign.id) ?? defaultRules(campaign.id);
  return (
    <>
      <PageHeading
        eyebrow={campaign.name}
        title="Regras da campanha"
        description="Defina a progressão do grupo, as permissões das fichas e os padrões dos próximos combates."
      />
      <RulesForm key={`${campaign.id}:${rules.updated_at}`} campaign={campaign} initial={rules} />
    </>
  );
}
function RulesForm({ campaign, initial }: { campaign: Campaign; initial: CampaignRules }) {
  const w = useWorkspace(),
    master = campaign.owner_id === w.user?.id,
    [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const toggle = (field: keyof CampaignRules, checked: boolean) =>
    setValue((v) => ({ ...v, [field]: checked }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!master || busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveRules(value, w.demo);
      await w.refresh();
      w.notify('Regras da campanha atualizadas.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const check = (field: keyof CampaignRules, label: string, hint: string) => (
    <label className="session-rule" key={field}>
      <input
        type="checkbox"
        checked={Boolean(value[field])}
        disabled={!master || busy}
        onChange={(e) => toggle(field, e.target.checked)}
      />
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
    </label>
  );
  return (
    <form className="session-rules-form" onSubmit={submit}>
      <ErrorBox message={error} />
      <section className="panel">
        <div className="panel-heading">
          <h2>
            <Shield size={20} /> Progressão do grupo
          </h2>
          <Badge tone={value.lock_player_level ? 'gold' : 'muted'}>
            {value.lock_player_level ? 'Nível definido pelo mestre' : 'Nível individual'}
          </Badge>
        </div>
        <Field
          label="Nível atual do grupo"
          hint="Ao ativar o controle, todos os personagens da campanha passam a este nível. NPCs mantêm seus níveis individuais."
        >
          <Input
            type="number"
            min={1}
            max={20}
            required
            value={value.party_level}
            disabled={!master || busy}
            onChange={(e) => setValue((v) => ({ ...v, party_level: Number(e.target.value) }))}
          />
        </Field>
        {check(
          'lock_player_level',
          'Mestre controla o nível de todos',
          'Bloqueia alterações de nível nas fichas. Para subir o grupo de nível, altere este campo e salve as regras.',
        )}
      </section>
      <section className="panel">
        <h2>Permissões dos jogadores</h2>
        {check(
          'players_can_create_characters',
          'Permitir criar personagens',
          'Quando desativado, o mestre cria as fichas do grupo.',
        )}
        {check(
          'players_can_edit_sheets',
          'Permitir editar as próprias fichas',
          'Quando desativado, os jogadores podem consultar a ficha. Movimento, ataques e aplicação de dano continuam disponíveis na Mesa.',
        )}
        {check(
          'players_can_end_turn',
          'Permitir encerrar o próprio turno',
          'Quando desativado, o mestre avança a ordem de iniciativa.',
        )}
      </section>
      <section className="panel">
        <h2>Padrões dos novos combates</h2>
        {check(
          'default_restrict_movement',
          'Movimento apenas no turno do personagem',
          'Usado nos novos grids. O mestre pode ajustar cada combate na Mesa.',
        )}
        {check(
          'default_failed_actions_consume',
          'Falha consome ação e recurso utilizado',
          'Usado nos novos grids. O mestre pode ajustar este padrão em cada combate.',
        )}
      </section>
      {master ? (
        <div className="form-actions">
          <Button type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />} Salvar regras
          </Button>
        </div>
      ) : (
        <p className="subtle">Estas regras são definidas pelo mestre da campanha.</p>
      )}
    </form>
  );
}
