import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProvider } from '@/lib/context';

export const metadata: Metadata = {
  title: 'Portify — Gestão de Portfólio',
  description: 'Gestão de património inteligente e simplificada.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Portify',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#fff8f5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body>
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
