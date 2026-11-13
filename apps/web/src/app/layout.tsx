import type { Metadata } from 'next';
import { Geist_Mono, Source_Sans_3, Source_Serif_4 } from 'next/font/google';
import { connection } from 'next/server';
import './globals.css';
import { Providers } from './providers';

// SHC type (S-018): Source Serif headings, Source Sans text.
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const sans = Source_Sans_3({ variable: '--font-source-sans', subsets: ['latin'], display: 'swap' });
const serif = Source_Serif_4({ variable: '--font-source-serif', subsets: ['latin'], display: 'swap', weight: ['500', '600', '700'] });

export const metadata: Metadata = {
  title: 'SHC',
  description: 'Recruitment, onboarding and staff management for UK care providers',
  // Staff records and applicant data — keep it out of search engines.
  robots: { index: false, follow: false },
};

/**
 * Every page renders per request so it carries the nonce from the Content-Security-Policy (proxy.ts, D-068).
 * The pages are signed-in client apps anyway — nothing here benefits from static prerendering.
 */
export default async function RootLayout({ children }: LayoutProps<'/'>) {
  await connection();
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
