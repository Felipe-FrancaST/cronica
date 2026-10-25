'use client';
import { Eye, Moon, Sun } from 'lucide-react';
import { Field, Select } from '@/components/ui';
import { mapVisionSettings, type MapVisionSettings } from './map-vision';
import { ambientDarkness } from './vision';
import type { BattleMap } from './types';

const presets: { label: string; settings: MapVisionSettings }[] = [
  { label: 'Dia iluminado', settings: { enabled: true, lighting: 'day', darkness: 'none' } },
  { label: 'Noite com penumbra', settings: { enabled: true, lighting: 'night', darkness: 'dim' } },
  { label: 'Noite escura', settings: { enabled: true, lighting: 'night', darkness: 'dark' } },
];
export function MapVisionSettingsPanel({
  map,
  disabled,
  onChange,
}: {
  map: BattleMap;
  disabled: boolean;
  onChange(settings: MapVisionSettings): void;
}) {
  const current = mapVisionSettings(map);
  const update = (patch: Partial<MapVisionSettings>) => onChange({ ...current, ...patch });
  return (
    <section className="vtt-player-vision-settings" aria-label="Visão dos jogadores">
      <div className="vtt-vision-heading">
        <Eye size={18} />
        <strong>Visão dos jogadores</strong>
      </div>
      <Field label="Modo de visão">
        <Select
          aria-label="Modo de visão dos jogadores"
          value={current.enabled ? 'individual' : 'free'}
          disabled={disabled}
          onChange={(e) => update({ enabled: e.target.value === 'individual' })}
        >
          <option value="individual">Por iluminação e sentidos</option>
          <option value="free">Mapa visível</option>
        </Select>
      </Field>
      <div className="vtt-vision-presets" role="group" aria-label="Atalhos de iluminação">
        {presets.map(({ label, settings }) => (
          <button
            key={label}
            type="button"
            className="vtt-focus-button"
            disabled={disabled}
            aria-pressed={
              current.enabled &&
              current.lighting === settings.lighting &&
              current.darkness === settings.darkness
            }
            onClick={() => onChange(settings)}
          >
            {settings.lighting === 'day' ? <Sun size={15} /> : <Moon size={15} />}
            {label}
          </button>
        ))}
      </div>
      <Field label="Período do mapa">
        <Select
          aria-label="Período do grid"
          value={current.lighting}
          disabled={disabled}
          onChange={(e) => {
            const lighting = e.target.value === 'night' ? 'night' : 'day';
            update({ lighting, darkness: ambientDarkness({ ...map, lighting }) });
          }}
        >
          <option value="day">Dia</option>
          <option value="night">Noite</option>
        </Select>
      </Field>
      <Field label="Escuridão geral do mapa">
        <Select
          aria-label="Escuridão geral do mapa"
          value={current.darkness}
          disabled={disabled}
          onChange={(e) => update({ darkness: e.target.value as MapVisionSettings['darkness'] })}
        >
          <option value="none">Iluminado</option>
          <option value="dim">Penumbra</option>
          <option value="dark">Escuridão total</option>
          <option value="magical">Escuridão mágica</option>
        </Select>
      </Field>
      <p className="vtt-vision-explanation" role="status">
        {!current.enabled
          ? 'Mapa visível: as sombras não limitam o que os jogadores enxergam. Os atalhos acima ativam a visão por iluminação.'
          : current.darkness === 'dim'
            ? 'Penumbra: cenário escurecido. A visão no escuro da raça permite enxergar normalmente dentro do seu alcance.'
            : current.darkness === 'dark'
              ? 'Sem luz, o jogador vê somente sua própria peça. A visão no escuro revela o alcance racial em tons de cinza; tochas e outras luzes revelam suas áreas.'
              : current.darkness === 'magical'
                ? 'Escuridão mágica: visão no escuro comum e tochas não a atravessam. Sentidos e magias apropriados continuam sendo considerados.'
                : 'As áreas iluminadas ficam visíveis, respeitando paredes e as áreas que o mestre manteve ocultas.'}
      </p>
      <details className="vtt-tool-disclosure">
        <summary>Como a visão funciona</summary>
        <div className="vtt-tool-disclosure-content">
          <p>
            O mestre continua vendo o mapa inteiro. Cada jogador enxerga a partir das suas criaturas
            no grid.
          </p>
          <p>
            O alcance racial é convertido para a escala do mapa. Uma tocha comum ilumina 6 m e cria
            mais 6 m de penumbra; ao apagá-la, essa área volta à iluminação do ambiente.
          </p>
          <p>
            Paredes e portas fechadas bloqueiam a visão e a luz. Uma luz distante pode ser vista
            através da escuridão comum se nada bloquear a linha de visão. Áreas ocultadas pelo
            mestre precisam ser reveladas por ele.
          </p>
        </div>
      </details>
    </section>
  );
}
