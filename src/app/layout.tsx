import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Visual Systems Academy — Packet Odyssey',
  description:
    'An interactive simulator of everything that happens between fetch() and PostgreSQL: V8, the Linux kernel, the NIC, the internet, TLS, Cloudflare, Docker, NestJS, Prisma — and the whole journey back.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#111315' },
  ],
};

/**
 * Runs before anything paints: stamp the theme on <html> from localStorage, falling back
 * to the OS preference. This is why there is no flash and why the CSS needs no
 * duplicated @media block — `data-theme` is always explicit.
 */
const THEME_BOOT = `(function(){try{var t=localStorage.getItem('vsa-theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // suppressHydrationWarning: data-theme is stamped pre-hydration on the client, so the
    // server-rendered attribute set intentionally differs.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="h-full overflow-hidden" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {children}
      </body>
    </html>
  );
}
