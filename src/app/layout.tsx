import type { Metadata, Viewport } from 'next';
import { Manrope, Unbounded } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import './responsive.css';
import { LangProvider } from '@/i18n/LangProvider';
import { detectLang, LANG_COOKIE, parseLang, type Lang } from '@/i18n/lang';

const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin', 'cyrillic'], weight: ['500', '600', '700', '800'] });
const unbounded = Unbounded({ variable: '--font-unbounded', subsets: ['latin', 'cyrillic'], weight: ['600', '800'] });

async function currentLang(): Promise<Lang> {
  const saved = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  return saved ?? detectLang((await headers()).get('accept-language'));
}

export async function generateMetadata(): Promise<Metadata> {
  const kk = (await currentLang()) === 'kk';
  return {
    title: kk ? 'TOK BURGER — Алматыда бургер жеткізу' : 'TOK BURGER — доставка бургеров в Алматы',
    description: kk
      ? 'Қарның ашты — біздің бургер. TOK BURGER-дің Алматыдағы 5 филиалынан жеткізу.'
      : 'Твой голод. Наш бургер. Доставка из 5 филиалов TOK BURGER в Алматы.',
    applicationName: 'TOK BURGER',
  };
}

export const viewport: Viewport = { themeColor: '#FF6A0A', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang();
  return (
    <html lang={lang} className={`${manrope.variable} ${unbounded.variable}`}>
      <body>
        <LangProvider initial={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
