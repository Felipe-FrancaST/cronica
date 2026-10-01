'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  BookOpen,
  LayoutDashboard,
  Compass,
  Users,
  ScrollText,
  Settings,
  LogOut,
  Plus,
  ChevronsUpDown,
  Menu,
  Swords,
  MapPin,
  Package,
  CalendarDays,
  ArrowLeft,
  Shield,
  UserRound,
  Check,
} from 'lucide-react';
import { Brand } from './brand';
import { Avatar } from './media';
import { Loading, Button, Modal, Badge, ErrorBox } from './ui';
import { useWorkspace } from '@/hooks/use-workspace';
import { cx, errorMessage } from '@/lib/utils';
import type { Campaign } from '@/types';
export function Shell({ children, campaign }: { children: ReactNode; campaign?: Campaign }) {
  const w = useWorkspace(),
    path = usePathname(),
    router = useRouter();
  const [mobile, setMobile] = useState(false),
    [logoutError, setLogoutError] = useState<string | null>(null);
  useEffect(() => {
    if (w.ready && !w.user) router.replace('/entrar');
    else if (w.ready && w.user && !w.mode) router.replace('/escolher-modo');
  }, [w.ready, w.user, w.mode, router]);
  useEffect(() => setMobile(false), [path]);
  if (!w.ready || !w.user || !w.mode) return <Loading />;
  const master = w.mode === 'master';
  const globalNav = [
    { href: '/', label: 'Início', icon: LayoutDashboard },
    { href: '/campanhas', label: master ? 'Minhas campanhas' : 'Minhas aventuras', icon: BookOpen },
    ...(master
      ? [
          { href: '/mundo', label: 'Mundo', icon: Compass },
          { href: '/npcs', label: 'NPCs', icon: Users },
        ]
      : []),
    { href: '/personagens', label: master ? 'Personagens' : 'Meus personagens', icon: ScrollText },
  ];
  const campaignNav = [
    { slug: '', label: 'Visão geral', icon: LayoutDashboard },
    { slug: '/jogadores', label: 'Jogadores', icon: Users },
    { slug: '/personagens', label: 'Personagens', icon: ScrollText },
    { slug: '/mundo', label: 'Mundo', icon: Compass },
    { slug: '/npcs', label: 'NPCs', icon: UserRound },
    { slug: '/locais', label: 'Locais', icon: MapPin },
    { slug: '/itens', label: 'Itens', icon: Package },
    { slug: '/sessoes', label: 'Sessões', icon: CalendarDays },
    ...(campaign?.owner_id === w.user.id
      ? [{ slug: '/configuracoes', label: 'Configurações', icon: Settings }]
      : []),
  ];
  async function logout() {
    try {
      await w.logout();
      router.push('/entrar');
    } catch (e) {
      setLogoutError(errorMessage(e));
    }
  }
  const sidebar = (
    <>
      <Link href="/" className="brand-link">
        <Brand />
      </Link>
      <div className="sidebar-divider" />
      <button className="mode-switch" onClick={() => router.push('/escolher-modo')}>
        <span className="mode-icon">{master ? <Shield size={18} /> : <Swords size={18} />}</span>
        <span>
          <small>VOCÊ ESTÁ COMO</small>
          <strong>{master ? 'Mestre' : 'Jogador'}</strong>
        </span>
        <ChevronsUpDown size={16} />
      </button>
      {campaign ? (
        <>
          <Link href="/campanhas" className="back-link">
            <ArrowLeft size={15} />
            Todas as campanhas
          </Link>
          <div className="sidebar-label">CAMPANHA ATUAL</div>
          <div className="sidebar-campaign">
            {campaign.name}
            <small>D&D 5e · SRD 5.1</small>
          </div>
        </>
      ) : (
        <div className="sidebar-label">SEU GRIMÓRIO</div>
      )}
      <nav aria-label="Navegação principal" className="main-nav">
        {campaign
          ? campaignNav.map(({ slug, label, icon: Icon }) => {
              const href = `/campanhas/${campaign.id}${slug}`;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cx('nav-link', path === href && 'nav-active')}
                  aria-current={path === href ? 'page' : undefined}
                >
                  <Icon size={19} strokeWidth={1.6} />
                  {label}
                </Link>
              );
            })
          : globalNav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cx('nav-link', path === href && 'nav-active')}
                aria-current={path === href ? 'page' : undefined}
              >
                <Icon size={19} strokeWidth={1.6} />
                {label}
              </Link>
            ))}
      </nav>
      {!campaign && master && (
        <Link href="/campanhas?criar=1" className="sidebar-create">
          <Plus size={17} />
          Criar campanha
        </Link>
      )}
      <div className="sidebar-bottom">
        <span className="sidebar-label">SUA CONTA</span>
        <Link href="/perfil" className={cx('nav-link', path === '/perfil' && 'nav-active')}>
          <UserRound size={18} />
          Meu perfil
        </Link>
        <Link
          href="/configuracoes"
          className={cx('nav-link', path === '/configuracoes' && 'nav-active')}
        >
          <Settings size={18} />
          Configurações
        </Link>
        <button className="nav-link logout-link" onClick={logout}>
          <LogOut size={18} />
          Sair
        </button>
        <div className="sidebar-signature">
          <span className="ornament">◇</span>
          <small>Histórias merecem ser lembradas.</small>
        </div>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">{sidebar}</aside>
      <Modal open={mobile} onClose={() => setMobile(false)} title="Seu grimório">
        <div className="mobile-nav">{sidebar}</div>
      </Modal>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Abrir menu"
            onClick={() => setMobile(true)}
          >
            <Menu size={23} />
          </button>
          <div className="breadcrumb">
            <BookOpen size={16} />
            <span>{campaign ? 'Campanhas' : 'Seu grimório'}</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{campaign?.name || (master ? 'Área do mestre' : 'Área do jogador')}</strong>
          </div>
          <div className="topbar-account">
            {w.demo && (
              <Link href="/configuracoes" className="demo-badge">
                Demonstração
              </Link>
            )}
            <Link href="/perfil" className="account-link">
              <Avatar name={w.user.name} path={w.user.avatar_path} size="small" />
              <span>
                {w.user.name.split(' ')[0]}
                <small>{master ? 'Mestre de aventuras' : 'Aventureiro'}</small>
              </span>
            </Link>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <ErrorBox message={logoutError} />
          {w.error && (
            <div className="workspace-error">
              <ErrorBox message={`Não foi possível carregar esta aventura. ${w.error}`} />
              <Button variant="secondary" onClick={() => void w.refresh().catch(() => {})}>
                Tentar novamente
              </Button>
            </div>
          )}
          {w.loading ? <Loading /> : children}
        </main>
        <footer className="app-footer">
          <span>
            CRÔNICA <span>·</span> Escreva o próximo capítulo.
          </span>
          <span>
            D&D 5e <span>·</span> SRD 5.1
          </span>
        </footer>
      </div>
      {w.toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {w.toast}
        </div>
      )}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
