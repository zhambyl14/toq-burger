import type { Metadata, Viewport } from 'next';
import { Montserrat, Onest } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import './responsive.css';
import { LangProvider } from '@/i18n/LangProvider';
import { detectLang, LANG_COOKIE, parseLang, type Lang } from '@/i18n/lang';

// Both families contain the Kazakh letters (ә ғ қ ң ө ұ ү һ і) — they live in the 'cyrillic-ext' subset, which must be loaded.
// (Manrope/Unbounded lack ә ғ қ ң ұ, which made Kazakh text fall back to a random system font.)
const body = Onest({ variable: '--font-body', subsets: ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'], weight: ['500', '600', '700', '800'] });
const display = Montserrat({ variable: '--font-display', subsets: ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'], weight: ['700', '800'] });

async function currentLang(): Promise<Lang> {
  const saved = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  return saved ?? detectLang((await headers()).get('accept-language'));
}

export async function generateMetadata(): Promise<Metadata> {
  const kk = (await currentLang()) === 'kk';
  return {
    title: kk ? 'TOK BURGER — Алматыда бургер жеткізу' : 'TOK BURGER — доставка бургеров в Алматы',
    description: kk
      ? 'Қарның ашты — біздің бургер. TOK BURGER-дің Алматыдағы филиалдарынан жеткізу.'
      : 'Твой голод. Наш бургер. Доставка из филиалов TOK BURGER в Алматы.',
    applicationName: 'TOK BURGER',
  };
}

export const viewport: Viewport = { themeColor: '#FF6A0A', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang();
  return (
    <html lang={lang} className={`${body.variable} ${display.variable}`}>
      <body>
        <LangProvider initial={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
