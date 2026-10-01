import type { Metadata, Viewport } from 'next';
import { WorkspaceProvider } from '@/hooks/use-workspace';
import './globals.css';
import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-500.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
export const metadata: Metadata = {
  title: { default: 'Crônica · Suas aventuras, um novo capítulo', template: '%s · Crônica' },
  description: 'Crie campanhas, construa mundos e viva suas aventuras de RPG.',
  icons: { icon: '/favicon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#141815' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </body>
    </html>
  );
}
