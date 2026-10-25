'use client';
import { useState } from 'react';
import { Button, ErrorBox, Field, Input, Modal, Select } from '@/components/ui';
import { SPELL_CATALOG } from '@/systems/dnd5e/spell-catalog';
import { SpellDetails } from '@/systems/dnd5e/spell-browser';
import type { BattleActionRequest, BattleSpellEffect } from './types';
import { errorMessage } from '@/lib/utils';
export interface NarrativeOptions {
  geometry: {
    shape: string;
    size: number;
    width: number;
    origin: 'point' | 'self';
    rotation: number;
  };
  visual: string;
  target?: { x: number; y: number };
}
export function NarrativeSpellDialog({
  request,
  effect,
  busy,
  onClose,
  onKeep,
}: {
  request: BattleActionRequest;
  effect?: BattleSpellEffect;
  busy: boolean;
  onClose(): void;
  onKeep(options: NarrativeOptions, place: boolean): Promise<void>;
}) {
  const d = effect?.definition ?? request.definition;
  const [shape, setShape] = useState(
      d.shape === 'self' || d.shape === 'single' ? 'sphere' : d.shape,
    ),
    [size, setSize] = useState(String(d.size || 1.5)),
    [width, setWidth] = useState(String(d.width || 1.5)),
    [rotation, setRotation] = useState(String(d.rotation ?? 0)),
    [visual, setVisual] = useState(d.scene?.visual ?? 'arcane'),
    [error, setError] = useState<string | null>(null);
  const spell = SPELL_CATALOG.find((s) => s.id === d.entry?.catalog_id);
  const valid =
    Number(size) > 0 && Number(size) <= 1000 && Number(width) > 0 && Number(width) <= 1000;
  async function keep(place: boolean) {
    setError(null);
    try {
      await onKeep(
        {
          geometry: {
            shape,
            size: Number(size),
            width: Number(width),
            origin: 'point',
            rotation: Number(rotation),
          },
          visual,
        },
        place,
      );
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={request.name}
      description="Magia utilizada · consulta do mestre"
      wide
      portalContainer={
        typeof document === 'undefined'
          ? undefined
          : (document.fullscreenElement as HTMLElement | null)
      }
    >
      <div className="form-stack">
        {spell ? (
          <SpellDetails spell={spell} />
        ) : (
          <p className="vtt-spell-description">
            {String(
              d.entry?.description ??
                d.note ??
                'Consulte a descrição registrada na ficha do conjurador.',
            )}
          </p>
        )}
        <ErrorBox message={error} />
        {request.status === 'success' && d.kind === 'utility' && (
          <details className="panel" open>
            <summary>Manter efeito ou área no grid</summary>
            <p className="subtle">
              A marcação ajuda a acompanhar a narrativa. A duração e a concentração da magia são
              preservadas. Dano, luz e condições seguem o perfil da magia; uma ilusão marcada não
              bloqueia visão automaticamente.
            </p>
            <div className="form-grid">
              <Field label="Formato do marcador">
                <Select value={shape} onChange={(e) => setShape(e.target.value as typeof shape)}>
                  <option value="sphere">Círculo / esfera</option>
                  <option value="cube">Quadrado / cubo</option>
                  <option value="line">Linha</option>
                  <option value="cone">Cone</option>
                  <option value="wall">Parede</option>
                </Select>
              </Field>
              <Field label={shape === 'sphere' ? 'Raio (m)' : 'Comprimento / lado (m)'}>
                <Input
                  type="number"
                  min={0.5}
                  max={1000}
                  step={0.5}
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                />
              </Field>
              {['wall', 'line'].includes(shape) && (
                <>
                  <Field label="Largura (m)">
                    <Input
                      type="number"
                      min={0.5}
                      max={1000}
                      step={0.5}
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                    />
                  </Field>
                  <Field label="Orientação">
                    <Select value={rotation} onChange={(e) => setRotation(e.target.value)}>
                      {[0, 45, 90, 135, 180, 225, 270, 315].map((v) => (
                        <option key={v} value={v}>
                          {v}°
                        </option>
                      ))}
                    </Select>
                  </Field>
                </>
              )}
              <Field label="Aparência da marcação">
                <Select value={visual} onChange={(e) => setVisual(e.target.value)}>
                  <option value="arcane">Arcana</option>
                  <option value="radiant">Radiante</option>
                  <option value="spirit">Espiritual</option>
                  <option value="mist">Névoa</option>
                  <option value="fire">Fogo</option>
                  <option value="vines">Vegetação</option>
                  <option value="barrier">Barreira</option>
                </Select>
              </Field>
            </div>
            <div className="vtt-action-buttons">
              <Button disabled={busy || !valid} onClick={() => void keep(false)}>
                Manter na posição da conjuração
              </Button>
              <Button variant="secondary" disabled={busy || !valid} onClick={() => void keep(true)}>
                Escolher posição no grid
              </Button>
            </div>
          </details>
        )}
      </div>
    </Modal>
  );
}
