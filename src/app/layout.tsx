import type { Metadata, Viewport } from 'next';
import { Manrope, Unbounded } from 'next/font/google';
import 'leaflet/dist/leaflet.css';
import './globals.css';

const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin', 'cyrillic'], weight: ['500', '600', '700', '800'] });
const unbounded = Unbounded({ variable: '--font-unbounded', subsets: ['latin', 'cyrillic'], weight: ['600', '800'] });

export const metadata: Metadata = {
  title: 'TOK BURGER — доставка бургеров в Алматы',
  description: 'Твой голод. Наш бургер. Доставка из 4 филиалов TOK BURGER в Алматы.',
  applicationName: 'TOK BURGER',
};

export const viewport: Viewport = { themeColor: '#FF6A0A', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${manrope.variable} ${unbounded.variable}`}>
      <body>{children}</body>
    </html>
  );
}
