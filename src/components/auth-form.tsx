'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound, LoaderCircle, Mail } from 'lucide-react';
import { Brand } from './brand';
import { Button, Field, Input, ErrorBox, SuccessBox } from './ui';
import { getSupabase, isConfigured, demoEnabled } from '@/lib/supabase/client';
import { useWorkspace } from '@/hooks/use-workspace';
import { errorMessage } from '@/lib/utils';
type AuthKind = 'login' | 'signup' | 'recovery' | 'password';
const content = {
  login: {
    title: 'Sua história continua.',
    description: 'Entre no seu grimório e encontre sua próxima aventura.',
    button: 'Entrar no grimório',
  },
  signup: {
    title: 'Toda lenda tem um começo.',
    description: 'Crie sua conta. Um universo de histórias espera por você.',
    button: 'Criar minha conta',
  },
  recovery: {
    title: 'Encontre o caminho de volta.',
    description: 'Enviaremos um link para você recuperar sua senha.',
    button: 'Enviar link de recuperação',
  },
  password: {
    title: 'Uma nova chave.',
    description: 'Escolha uma nova senha para sua conta.',
    button: 'Salvar nova senha',
  },
};
function friendlyError(error: unknown) {
  const message = errorMessage(error);
  if (message.includes('Invalid login')) return 'Email ou senha incorretos.';
  if (message.includes('Email not confirmed')) return 'Confirme seu email antes de entrar.';
  if (message.includes('already registered')) return 'Este email já possui uma conta.';
  if (message.includes('rate limit'))
    return 'Muitas tentativas. Aguarde um momento e tente novamente.';
  return message;
}
export function AuthForm({ kind }: { kind: AuthKind }) {
  const w = useWorkspace(),
    router = useRouter();
  const [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [success, setSuccess] = useState<string | null>(null);
  const c = content[kind];
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('erro') === 'link-expirado') {
      setError('Este link expirou ou já foi usado. Solicite um novo link para continuar.');
    }
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!isConfigured()) {
      setError(
        'O Supabase ainda não foi conectado. Você pode explorar a demonstração enquanto configura o projeto.',
      );
      return;
    }
    if ((kind === 'signup' || kind === 'password') && password !== confirm) {
      setError('As senhas precisam ser iguais.');
      return;
    }
    setBusy(true);
    try {
      const s = getSupabase();
      const origin = window.location.origin;
      if (kind === 'login') {
        const { error } = await s.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        router.push('/escolher-modo');
      }
      if (kind === 'signup') {
        const { data, error } = await s.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() }, emailRedirectTo: `${origin}/auth/callback` },
        });
        if (error) throw error;
        if (data.session) router.push('/escolher-modo');
        else setSuccess('Conta criada. Confira seu email para confirmar o cadastro.');
      }
      if (kind === 'recovery') {
        const { error } = await s.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${origin}/auth/callback?next=/alterar-senha`,
        });
        if (error) throw error;
        setSuccess('Se este email possui uma conta, você receberá o link de recuperação.');
      }
      if (kind === 'password') {
        const { data } = await s.auth.getUser();
        if (!data.user) throw new Error('Este link expirou. Solicite um novo link de recuperação.');
        const { error } = await s.auth.updateUser({ password });
        if (error) throw error;
        setSuccess('Senha atualizada. Você já pode voltar ao seu grimório.');
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-art">
        <div className="cover-image">
          <img
            src="/images/fortress.webp"
            alt="Uma fortaleza entre as montanhas de um mundo de fantasia"
          />
        </div>
        <Brand />
        <div className="auth-art-copy">
          <div className="eyebrow">SEU MUNDO. SUA HISTÓRIA.</div>
          <h1>As melhores aventuras começam à mesa.</h1>
          <p>
            Um lugar para criar mundos, reunir seus aventureiros e guardar cada capítulo da sua
            jornada.
          </p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-form">
          <div className="auth-logo-mobile">
            <Brand />
          </div>
          <div className="eyebrow">BEM-VINDO À CRÔNICA</div>
          <h1>{c.title}</h1>
          <p>{c.description}</p>
          <form onSubmit={submit} className="form-stack">
            <ErrorBox message={error} />
            <SuccessBox message={success} />
            {kind === 'signup' && (
              <Field label="Seu nome">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                  autoComplete="name"
                  placeholder="Como devemos chamar você?"
                />
              </Field>
            )}
            {kind !== 'password' && (
              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="seu@email.com"
                />
              </Field>
            )}
            {kind !== 'recovery' && (
              <Field
                label={kind === 'password' ? 'Nova senha' : 'Senha'}
                hint={
                  kind === 'signup' || kind === 'password'
                    ? 'Use pelo menos 8 caracteres.'
                    : undefined
                }
              >
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={kind === 'login' ? 1 : 8}
                  autoComplete={kind === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                />
              </Field>
            )}
            {(kind === 'signup' || kind === 'password') && (
              <Field label="Confirmar senha">
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </Field>
            )}
            <Button disabled={busy} type="submit">
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : kind === 'recovery' ? (
                <Mail size={18} />
              ) : (
                <KeyRound size={18} />
              )}{' '}
              {c.button}
            </Button>
          </form>
          {kind === 'login' ? (
            <>
              <Link href="/recuperar-senha" className="auth-link">
                Esqueci minha senha
              </Link>
              <Link href="/cadastro" className="auth-link">
                Ainda não tenho uma conta · Criar conta
              </Link>
            </>
          ) : (
            <Link href={kind === 'password' && w.user ? '/' : '/entrar'} className="auth-link">
              {kind === 'password' && w.user ? 'Voltar ao grimório' : 'Voltar para o login'}
            </Link>
          )}
          {!isConfigured() && demoEnabled() && (
            <>
              <div className="auth-divider">ou conheça a plataforma</div>
              <Button
                variant="secondary"
                onClick={() => {
                  w.enterDemo();
                  router.push('/escolher-modo');
                }}
              >
                Explorar demonstração
              </Button>
              <p className="auth-caption">Dados de exemplo, salvos apenas neste navegador.</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
