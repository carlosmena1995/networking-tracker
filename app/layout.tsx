import type { Metadata } from 'next';
import { Source_Sans_3, Source_Serif_4, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

/**
 * Berkeley's own brand fonts (Freight Sans / Freight Display) are licensed and
 * cannot be redistributed, so this uses Adobe's Source superfamily: the closest
 * open pairing in feel, and designed to work together.
 *
 * Source Serif carries the headings the way the Berkeley wordmark does;
 * Source Sans keeps dense contact rows readable.
 */
const sourceSans = Source_Sans_3({
  variable: '--font-source-sans',
  subsets: ['latin'],
  display: 'swap',
});

const sourceSerif = Source_Serif_4({
  variable: '--font-source-serif',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Networking Tracker',
  description: 'Keep track of the people you want to stay connected with at Berkeley.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${sourceSans.variable} ${sourceSerif.variable} ${geistMono.variable} bg-background min-h-svh antialiased`}
      >
        {/* Berkeley Blue into California Gold. The one piece of pure decoration
            in the app, and it sets the palette before anything else renders. */}
        <div aria-hidden className="berkeley-rule" />
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
