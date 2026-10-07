'use client';
import { useState, type FormEvent } from 'react';
import { Shield, Save, LoaderCircle } from 'lucide-react';
import type { Campaign } from '@/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { PageHeading } from '@/components/shell';
import { Button, Field, Input, Select, ErrorBox, Badge, Empty } from '@/components/ui';
import { errorMessage } from '@/lib/utils';
import { rulesFor, type CampaignRules } from './types';
import { saveRules } from './repository';
import { BlockedActionScope } from '@/components/action-notice';
export function RulesPage({ campaign }: { campaign: Campaign }) {
  const w = useWorkspace(),
    rules = rulesFor(w.data.rules, campaign.id);
  if (campaign.owner_id !== w.user?.id)
    return <Empty title="Somente o mestre pode acessar as regras da campanha." />;
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
        aria-label={label}
        aria-describedby={`${campaign.id}-${field}-hint`}
        checked={Boolean(value[field])}
        disabled={!master || busy}
        onChange={(e) => toggle(field, e.target.checked)}
      />
      <span>
        <strong>{label}</strong>
        <small id={`${campaign.id}-${field}-hint`}>{hint}</small>
      </span>
    </label>
  );
  return (
    <BlockedActionScope reason="Aguarde o salvamento das regras terminar para alterar outra opção.">
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
          <h2>Classes, atributos e pontos de vida</h2>
          {check(
            'allow_multiclass',
            'Permitir multiclasse',
            'Habilita adicionar outras classes. Ao desativar, personagens existentes mantêm suas classes e a campanha bloqueia novas combinações.',
          )}
          <Field
            label="Pontos de vida ao subir de nível"
            hint="O primeiro nível da classe inicial usa o dado cheio. Constituição e bônus de raça/classe são aplicados a cada nível. Alterar o método recalcula os PV máximos sem curar o grupo."
          >
            <Select
              value={value.hit_point_method}
              disabled={busy}
              onChange={(event) =>
                setValue((previous) => ({
                  ...previous,
                  hit_point_method: event.target.value as CampaignRules['hit_point_method'],
                }))
              }
            >
              <option value="average">Média fixa do dado (padrão D&D)</option>
              <option value="maximum">Dado sempre cheio</option>
              <option value="rolled">Rolar uma vez por nível</option>
            </Select>
          </Field>
          {value.hit_point_method === 'rolled' && (
            <p className="info-box">
              Cada resultado fica registrado por classe e nível. Reabrir a ficha, baixar e subir o
              nível ou repetir o pedido não gera outra rolagem. Ao mudar esta regra, os níveis
              existentes ainda sem resultado são rolados uma vez pelo banco.
            </p>
          )}
          <Field
            label="Método de atributos para novos personagens"
            hint="Fichas existentes mantêm sua distribuição. O método escolhido será aplicado na criação dos próximos personagens."
          >
            <Select
              value={value.attribute_method}
              disabled={busy}
              onChange={(event) =>
                setValue((previous) => ({
                  ...previous,
                  attribute_method: event.target.value as CampaignRules['attribute_method'],
                }))
              }
            >
              <option value="choice">Jogador escolhe o método</option>
              <option value="standard">Conjunto padrão</option>
              <option value="point-buy">Compra de 27 pontos</option>
              <option value="rolled">Rolagem de 4d6, descartando o menor</option>
              <option value="manual">Atributos definidos manualmente</option>
            </Select>
          </Field>
        </section>
        <section className="panel">
          <h2>Permissões dos jogadores</h2>
          {check(
            'players_can_rest',
            'Permitir recuperar recursos por descanso',
            'Quando desativado, só o mestre pode restaurar espaços de magia, dados de vida e usos de habilidades nas fichas. O gasto de recursos continua disponível.',
          )}
          {check(
            'players_can_create_custom_items',
            'Permitir criar itens personalizados',
            'Quando desativado, jogadores adicionam itens do catálogo. Itens personalizados existentes e equipamento inicial são preservados.',
          )}
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
              {busy ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />} Salvar
              regras
            </Button>
          </div>
        ) : (
          <p className="subtle">Estas regras são definidas pelo mestre da campanha.</p>
        )}
      </form>
    </BlockedActionScope>
  );
}
