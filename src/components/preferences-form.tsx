'use client';
import { useRef, useState, type FormEvent } from 'react';
import { Eye, Monitor, Save, RotateCcw, LoaderCircle } from 'lucide-react';
import { useWorkspace } from '@/hooks/use-workspace';
import {
  DEFAULT_PREFERENCES,
  preferencesEqual,
  readPreferences,
  type Preferences,
} from '@/lib/preferences';
import { errorMessage } from '@/lib/utils';
import { Button, ErrorBox, Field, Select } from './ui';

export function PreferencesForm() {
  const w = useWorkspace();
  const saved = readPreferences(w.user?.preferences);
  const [draft, setDraft] = useState<Partial<Preferences>>({});
  const [resetRequested, setResetRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const value = { ...saved, ...draft };
  const dirty = resetRequested || !preferencesEqual(value, saved);
  function change<K extends keyof Preferences>(key: K, next: Preferences[K]) {
    setDraft((previous) => ({ ...previous, [key]: next }));
    setError(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current || !dirty) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      await w.savePreferences(draft);
      setDraft({});
      setResetRequested(false);
      w.notify('Preferências salvas.');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="preferences-form"
      onSubmit={submit}
      aria-label="Preferências pessoais"
      aria-busy={busy}
    >
      <ErrorBox message={error} />
      <section className="panel">
        <div className="panel-heading">
          <h2>
            <Eye size={19} /> Aparência e acessibilidade
          </h2>
        </div>
        <div className="settings-fields">
          <Field
            label="Tamanho do texto"
            hint="Aumenta o texto e os controles para facilitar a leitura."
          >
            <Select
              value={value.text_size}
              disabled={busy}
              onChange={(e) => change('text_size', e.target.value as Preferences['text_size'])}
            >
              <option value="standard">Padrão</option>
              <option value="large">Ampliado</option>
            </Select>
          </Field>
          <Field
            label="Movimento da interface"
            hint="O modo automático respeita a preferência de acessibilidade do seu dispositivo."
          >
            <Select
              value={value.motion}
              disabled={busy}
              onChange={(e) => change('motion', e.target.value as Preferences['motion'])}
            >
              <option value="system">Seguir o dispositivo</option>
              <option value="reduced">Reduzir movimento</option>
            </Select>
          </Field>
        </div>
        <label className="settings-check">
          <input
            type="checkbox"
            disabled={busy}
            checked={value.compact_cards}
            onChange={(e) => change('compact_cards', e.target.checked)}
          />
          <span>
            <strong>Cards de campanha compactos</strong>
            <small>Oculta as descrições na lista de campanhas.</small>
          </span>
        </label>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            <Monitor size={19} /> Mesa e dados
          </h2>
        </div>
        <p className="settings-section-description">
          Escolha os padrões usados ao abrir a mesa. Salvar aqui também redefine os ajustes rápidos
          deste navegador.
        </p>
        <div className="settings-fields">
          <Field
            label="Visualização inicial do mapa"
            hint="O modo 2D exige menos do dispositivo e funciona sem aceleração 3D."
          >
            <Select
              value={value.vtt_view}
              disabled={busy}
              onChange={(e) => change('vtt_view', e.target.value as Preferences['vtt_view'])}
            >
              <option value="3d">3D</option>
              <option value="2d">2D · mais leve</option>
            </Select>
          </Field>
          <Field
            label="Qualidade do 3D"
            hint="O modo leve reduz a resolução e remove as sombras; as regras de visão continuam iguais."
          >
            <Select
              value={value.vtt_quality}
              disabled={busy}
              onChange={(e) => change('vtt_quality', e.target.value as Preferences['vtt_quality'])}
            >
              <option value="balanced">Equilibrada · com sombras</option>
              <option value="low">Leve · sem sombras</option>
            </Select>
          </Field>
        </div>
        <label className="settings-check">
          <input
            type="checkbox"
            disabled={busy}
            checked={value.dice_animation}
            onChange={(e) => change('dice_animation', e.target.checked)}
          />
          <span>
            <strong>Animar rolagens de dados</strong>
            <small>
              Com movimento reduzido, o resultado aparece sem a animação. O histórico é mantido.
            </small>
          </span>
        </label>
      </section>
      <div className="settings-savebar">
        <span role="status">
          {busy
            ? 'Salvando…'
            : dirty
              ? 'Você tem alterações para salvar.'
              : 'Suas preferências estão atualizadas.'}
        </span>
        <div className="settings-save-actions">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setDraft({ ...DEFAULT_PREFERENCES });
              setResetRequested(true);
              setError(null);
            }}
          >
            <RotateCcw size={16} />
            Restaurar padrões
          </Button>
          <Button
            type="submit"
            disabled={busy || !dirty}
            disabledReason={
              busy ? 'Aguarde as preferências serem salvas.' : 'Altere uma preferência para salvar.'
            }
          >
            {busy ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}Salvar
            preferências
          </Button>
        </div>
      </div>
    </form>
  );
}
