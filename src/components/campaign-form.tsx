'use client';
import { useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, Save } from 'lucide-react';
import { Button, Field, Input, Select, Textarea, ErrorBox } from './ui';
import { ImageField } from './media';
import { useWorkspace } from '@/hooks/use-workspace';
import type { Campaign } from '@/types';
import { uid, now, errorMessage } from '@/lib/utils';
import { uploadImage } from '@/services/storage';
import { useEditorDraft } from '@/hooks/use-editor-draft';
import { DraftRecovery } from './draft-recovery';
export function CampaignForm({
  campaign,
  onSaved,
  onCancel,
}: {
  campaign?: Campaign;
  onSaved(c: Campaign): void;
  onCancel(): void;
}) {
  const w = useWorkspace();
  const expected = useRef(campaign?.updated_at ?? null);
  const [value, setValue] = useState<Campaign>(
    () =>
      campaign ?? {
        id: uid(),
        owner_id: w.user!.id,
        name: '',
        description: '',
        theme: 'Fantasia medieval',
        cover_path: null,
        rpg_system_id: w.data.systems[0]?.id ?? '',
        status: 'active',
        created_at: now(),
        updated_at: now(),
      },
  );
  const [file, setFile] = useState<File | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const set = <K extends keyof Campaign>(key: K, val: Campaign[K]) =>
    setValue((v) => ({ ...v, [key]: val }));
  const draft = useEditorDraft(
    w.user?.id,
    `campaign:${campaign?.id ?? 'new'}`,
    value,
    expected.current,
    (saved, version) => {
      expected.current = version;
      setValue(saved);
    },
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!value.name.trim() || !value.rpg_system_id) {
      setError('Preencha o nome e escolha um sistema.');
      return;
    }
    setBusy(true);
    try {
      let result = { ...value, name: value.name.trim() };
      await w.perform(
        async (repo) => {
          await repo.saveCampaign(result, expected.current);
          expected.current = result.updated_at;
          setValue({ ...result });
          if (file) {
            result = {
              ...result,
              cover_path: await uploadImage(file, 'campaigns', result.id, w.demo),
            };
            await repo.saveCampaign(result, expected.current);
            expected.current = result.updated_at;
            setValue({ ...result });
          }
        },
        campaign ? 'Campanha atualizada.' : 'Campanha criada com sucesso.',
      );
      draft.clear();
      onSaved(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <ErrorBox message={error} />
      <DraftRecovery draft={draft} />
      <Field label="Nome da campanha">
        <Input
          required
          maxLength={120}
          placeholder="Como sua história será lembrada?"
          value={value.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>
      <Field label="Descrição">
        <Textarea
          maxLength={6000}
          placeholder="O que espera seus aventureiros neste mundo?"
          value={value.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>
      <div className="form-grid">
        <Field label="Sistema de RPG">
          <Select
            value={value.rpg_system_id}
            required
            onChange={(e) => set('rpg_system_id', e.target.value)}
          >
            {w.data.systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.version}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tema / ambientação">
          <Input
            maxLength={120}
            value={value.theme}
            onChange={(e) => set('theme', e.target.value)}
            placeholder="Fantasia sombria, exploração..."
          />
        </Field>
      </div>
      <Field label="Status">
        <Select
          value={value.status}
          onChange={(e) => set('status', e.target.value as Campaign['status'])}
        >
          <option value="active">Ativa</option>
          <option value="archived">Arquivada</option>
        </Select>
      </Field>
      <ImageField
        aspect={16 / 9}
        value={file}
        current={value.cover_path}
        onChange={setFile}
        onError={setError}
        label="Adicionar capa"
      />
      {file && <small className="file-name">{file.name}</small>}
      <div className="form-actions">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <LoaderCircle size={18} className="spin" /> : <Save size={18} />}{' '}
          {campaign ? 'Salvar alterações' : 'Criar campanha'}
        </Button>
      </div>
    </form>
  );
}
