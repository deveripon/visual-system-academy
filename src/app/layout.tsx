import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Visual Systems Academy — Packet Odyssey',
  description:
    'An interactive simulator of everything that happens between fetch() and PostgreSQL: V8, the Linux kernel, the NIC, the internet, TLS, Cloudflare, Docker, NestJS, Prisma — and the whole journey back.',
};

export const viewport: Viewport = {
  themeColor: '#06080f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full antialiased">
      {/* Extensions routinely inject attributes onto <body> before React hydrates
          (Grammarly, ColorZilla, …); that is not a mismatch worth reporting. */}
      <body className="h-full overflow-hidden" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
