'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Save, LoaderCircle, RefreshCcw } from 'lucide-react';
import { Shell, PageHeading } from './shell';
import { Avatar, ImageField } from './media';
import { Button, Field, Input, ErrorBox, Confirm, Badge } from './ui';
import { useWorkspace } from '@/hooks/use-workspace';
import { uploadImage } from '@/services/storage';
import { resetDemo } from '@/services/demo-repository';
import { errorMessage, dateLabel } from '@/lib/utils';
export function ProfilePage() {
  const w = useWorkspace();
  const [name, setName] = useState<string | null>(null),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!w.user) return;
    setBusy(true);
    setError(null);
    try {
      let profile = { ...w.user, name: (name ?? w.user.name).trim() };
      if (!profile.name) throw new Error('Preencha seu nome.');
      if (file)
        profile = {
          ...profile,
          avatar_path: await uploadImage(file, 'profiles', profile.id, w.demo),
        };
      await w.perform((repo) => repo.saveProfile(profile), 'Perfil atualizado.');
      setFile(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <PageHeading
        eyebrow="O AVENTUREIRO POR TRÁS DAS HISTÓRIAS"
        title="Meu perfil"
        description="Uma conta para criar e viver todas as suas aventuras."
      />
      {w.user && (
        <div className="profile-layout">
          <section className="panel">
            <div className="profile-hero">
              <Avatar name={w.user.name} path={w.user.avatar_path} size="large" />
              <div>
                <h2>{w.user.name}</h2>
                <p>{w.user.email}</p>
                <small className="subtle">Na Crônica desde {dateLabel(w.user.created_at)}</small>
              </div>
            </div>
            <form onSubmit={submit} className="form-stack">
              <ErrorBox message={error} />
              <Field label="Nome">
                <Input
                  required
                  maxLength={100}
                  value={name ?? w.user.name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </Field>
              <Field label="Email" hint="O mestre usa este email para vincular você às campanhas.">
                <Input value={w.user.email} readOnly type="email" />
              </Field>
              <ImageField
                onChange={setFile}
                onError={setError}
                current={w.user.avatar_path}
                label="Adicionar avatar"
              />
              {file && <small className="file-name">{file.name}</small>}
              <div className="form-actions">
                <Button disabled={busy}>
                  {busy ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />}Salvar
                  perfil
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </Shell>
  );
}
export function SettingsPage() {
  const w = useWorkspace();
  const [confirm, setConfirm] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function preference(value: boolean) {
    if (!w.user) return;
    setBusy(true);
    try {
      await w.perform(
        (r) =>
          r.saveProfile({
            ...w.user!,
            preferences: { ...w.user!.preferences, compact_cards: value },
          }),
        'Preferências salvas.',
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <PageHeading
        eyebrow="DO SEU JEITO"
        title="Configurações"
        description="Ajuste sua experiência no grimório."
      />
      <div className="profile-layout settings-list">
        <ErrorBox message={error} />
        <section className="panel">
          <div className="panel-heading">
            <h2>Conta e acesso</h2>
          </div>
          <div className="settings-row">
            <div>
              <strong>Modo de entrada</strong>
              <p>Você pode conduzir uma campanha e participar de outra.</p>
            </div>
            <Link className="button button-secondary" href="/escolher-modo">
              Trocar modo
            </Link>
          </div>
          <div className="form-divider settings-row">
            <div>
              <strong>Senha</strong>
              <p>Altere a senha da sua conta.</p>
            </div>
            <Link className="button button-ghost" href="/alterar-senha">
              Alterar senha
            </Link>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Preferências</h2>
          </div>
          <label className="visibility-label">
            <input
              type="checkbox"
              disabled={busy}
              checked={Boolean(w.user?.preferences.compact_cards)}
              onChange={(e) => void preference(e.target.checked)}
            />
            Ocultar descrições nos cards de campanha
          </label>
        </section>
        {w.demo && (
          <section className="panel">
            <div className="panel-heading">
              <h2>Demonstração</h2>
              <Badge>DADOS DE EXEMPLO</Badge>
            </div>
            <p>
              As alterações desta demonstração ficam somente neste navegador. As contas de exemplo
              disponíveis são marina@cronica.demo, lucas@cronica.demo e sofia@cronica.demo.
            </p>
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setConfirm(true)}>
                <RefreshCcw size={17} />
                Restaurar exemplos
              </Button>
            </div>
          </section>
        )}
        <section className="panel">
          <div className="panel-heading">
            <h2>Sistemas e próximas expansões</h2>
          </div>
          <p>
            D&D 5e · SRD 5.1 está disponível nesta versão. Novos sistemas terão seus próprios
            módulos de regras e fichas. A mesa tática 3D já está disponível nas campanhas. Sessões
            narrativas e itens de campanha estão reservados para versões futuras.
          </p>
        </section>
        <Confirm
          open={confirm}
          onCancel={() => setConfirm(false)}
          title="Restaurar a demonstração?"
          description="As alterações locais serão removidas e os exemplos iniciais serão restaurados."
          onConfirm={() => {
            resetDemo();
            setConfirm(false);
            void w.refresh();
            w.notify('Demonstração restaurada.');
          }}
        />
      </div>
    </Shell>
  );
}
