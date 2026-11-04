'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCatalog } from '@/components/CatalogProvider';
import { BoltMark } from '@/components/customer/BoltMark';
import { BrandFooter } from '@/components/customer/BrandFooter';
import { ChampionHeader } from '@/components/customer/ChampionHeader';
import { ComboBuilder } from '@/components/customer/ComboBuilder';
import { HalalBadge } from '@/components/customer/HalalBadge';
import { LastOrderCard } from '@/components/customer/LastOrderCard';
import { PriceText } from '@/components/customer/PriceTag';
import { useQuickAdd } from '@/components/customer/useQuickAdd';
import { VariantPills } from '@/components/customer/VariantPills';
import { Heart, Logo, NotConfigured, ProductImg, toast } from '@/components/ui';
import { isBranchOpen } from '@/features/branches/assign';
import { defaultMeat, priceFromL, useBreak, useMounted, useNowMinute, variantImage } from '@/features/catalog/hooks';
import { useLang } from '@/i18n/LangProvider';
import { LangSwitch } from '@/i18n/LangSwitch';
import { useApp } from '@/stores/app';
import '@/styles/home.css';

export default function HomePage() {
  const { products, branches, hours, configured } = useCatalog();
  const { t, tx, lang } = useLang();
  const router = useRouter();
  const brk = useBreak();
  const now = useNowMinute();
  const mounted = useMounted();
  const quickAdd = useQuickAdd();
  const address = useApp((s) => s.address);
  const favs = useApp((s) => s.favs);
  const toggleFav = useApp((s) => s.toggleFav);
  const burgers = products.filter((p) => p.category === 'burgers');
  const champion = products.find((p) => p.slug === 'champion');
  const hero = products.find((p) => p.slug === 'double') ?? burgers[0];
  const addrShort = mounted && address ? address.label : t('Выберите адрес', 'Мекенжайды таңдаңыз');
  const chipReady = !!now && branches.length > 0;

  const steps: [string, string][] = [
    [t('Выберите', 'Таңдаңыз'), t('Бургеры, закуски и напитки из меню', 'Мәзірден бургерлер, тіскебасарлар және сусындар')],
    [t('Мы готовим', 'Біз дайындаймыз'), t('Кухня собирает ваш заказ', 'Асхана тапсырысыңызды жинайды')],
    [t('Доставим горячим', 'Ыстықтай жеткіземіз'), t('Доставка по Алматы или самовывоз', 'Алматы бойынша жеткізу немесе өзі алып кету')],
  ];

  const classic = products.find((p) => p.slug === 'classic') ?? burgers[0];
  const tiles: { id: string; label: string; img: string | null | undefined; bg: string }[] = [
    { id: 'beef', label: t('С говядиной', 'Сиыр етімен'), img: classic ? variantImage(classic, 'beef') : null, bg: '#FFF1E0' },
    { id: 'chicken', label: t('С курицей', 'Тауық етімен'), img: champion ? variantImage(champion, 'chicken') : null, bg: '#F3EADF' },
    { id: 'sides', label: t('Фри и закуски', 'Фри және тіскебасарлар'), img: products.find((p) => p.slug === 'fries')?.image, bg: '#F3EADF' },
    { id: 'drinks', label: t('Напитки', 'Сусындар'), img: products.find((p) => p.category === 'drinks' && p.image)?.image, bg: '#FFF1E0' },
  ];

  const nBr = branches.length;
  const branchTitle = nBr
    ? t(`${nBr} ${nBr === 1 ? 'филиал' : nBr < 5 ? 'филиала' : 'филиалов'} в Алматы`, `Алматыда ${nBr} филиал`)
    : t('Филиалы в Алматы', 'Алматыдағы филиалдар');
  const champText = t('Хрустящая курица, коул-слоу и порция мёда.', 'Қытырлақ тауық еті, коул-слоу және бал порциясы.');

  return (
    <div className="scr scr-in hm-page">
      {!configured && <NotConfigured />}
      {brk && (
        <div className="hm-notice">
          <b style={{ color: '#FF6A0A' }}>{t('Технический перерыв 06:00–08:00.', 'Техникалық үзіліс 06:00–08:00.')}</b>{' '}
          {t('Сейчас заказ можно только запланировать на время после 08:00.', 'Қазір тапсырысты тек сағат 08:00-ден кейінгі уақытқа жоспарлауға болады.')}
        </div>
      )}

      <div className="hm-hero" style={{ marginTop: brk ? 16 : undefined }}>
        <span aria-hidden="true" className="hm-bolt hm-hero-deco hm-hero-deco--a" />
        <span aria-hidden="true" className="hm-bolt hm-hero-deco hm-hero-deco--b" />
        <span aria-hidden="true" className="hm-bolt hm-hero-deco hm-hero-deco--c" />

        <div className="hm-hero-top">
          <Logo />
          <button className="btn hm-addr" onClick={() => router.push('/map')}>
            <span className="hm-addr-l">{t('Доставка по адресу', 'Мекенжай бойынша жеткізу')}</span>
            <span className="hm-addr-v">{addrShort}<span aria-hidden="true"> ▾</span></span>
          </button>
          <LangSwitch variant="onOrange" />
          <Link href="/menu?focus=1" className="btn hm-search" aria-label={t('Поиск', 'Іздеу')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#141210" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          </Link>
        </div>

        <div className="hm-hero-copy">
          <div className="hm-chips">
            <HalalBadge />
            <span className="hm-status" style={{ visibility: chipReady ? 'visible' : 'hidden' }} role={chipReady ? 'status' : undefined}>
              <span className="live-dot" style={{ background: brk ? '#FFB27A' : '#4CD964' }} />
              {brk ? t('Перерыв до 08:00', 'Үзіліс 08:00-ге дейін') : t('Открыто', 'Ашық')}
            </span>
          </div>

          <div className="hm-hero-text">
            <div className="hm-eyebrow"><BoltMark size={18} tone="ink" />TOK BURGER · АЛМАТЫ</div>
            <h1 className={`disp hm-h1${lang === 'kk' ? ' hm-h1--kk' : ''}`}>
              {t('ТВОЙ ГОЛОД.', 'СЕНІҢ АШТЫҒЫҢ.')}<br />{t('НАШ БУРГЕР.', 'БІЗДІҢ БУРГЕР.')}
            </h1>
            <div className="hm-sub">
              {t('Готовим с любовью.', 'Сүйіспеншілікпен дайындаймыз.')}<br />{t('Доставляем горячим.', 'Ыстықтай жеткіземіз.')}
            </div>
          </div>

          <Link href="/menu" className="btn hm-cta">{t('Заказать сейчас', 'Қазір тапсырыс беру')} →</Link>
        </div>

        <div className="hov hm-hero-img" style={{ animation: 'float 5s ease-in-out infinite' }}>
          {hero && <ProductImg path={variantImage(hero, 'beef')} priority />}
        </div>
        <div className="hm-hero-pad" />
      </div>

      <div className="hm-tiles">
        {tiles.map((tl) => (
          <Link key={tl.id} href={`/menu?cat=${tl.id}`} className="btn hm-tile">
            <span className="hm-tile-l">{tl.label}</span>
            <span className="hm-tile-i" style={{ background: tl.bg }}><ProductImg path={tl.img} /></span>
          </Link>
        ))}
      </div>

      <div className="hm-sec-head hm-hits-head">
        <h2 className="disp hm-h2"><BoltMark size={26} />{t('Хиты', 'Хиттер')}</h2>
        <Link href="/menu" className="btn hm-link">{t('Всё меню', 'Бүкіл мәзір')}</Link>
      </div>
      <div className="scr hscroll hm-hits" role="list" aria-label={t('Хиты', 'Хиттер')}>
        {burgers.map((b) => {
          const fav = mounted && favs.includes(b.id);
          const isClassic = b.slug === 'classic';
          const name = tx(b.name, b.nameKk);
          return (
            <div key={b.id} role="listitem" className="hm-hit">
              <button className="btn hm-fav" aria-label={`${t('В избранное', 'Таңдаулыларға')}: ${name}`} aria-pressed={fav}
                onClick={() => toast(toggleFav(b.id) ? t('Добавлено в избранное', 'Таңдаулыларға қосылды') : t('Убрано из избранного', 'Таңдаулылардан жойылды'))}>
                <Heart on={fav} />
              </button>
              <Link href={`/product/${b.slug}`} className="btn hov hm-hit-img" aria-label={name} style={{ background: isClassic ? '#FF6A0A' : '#FFF1E0' }}>
                <ProductImg path={variantImage(b, defaultMeat(b))} fit={isClassic ? 'cover' : 'contain'} />
              </Link>
              <div className="disp hm-hit-name">{name}</div>
              <div className="hm-hit-tag">{tx(b.tagline, b.taglineKk)}</div>
              <VariantPills product={b} />
              <button className="btn hm-add" aria-label={`${t('Добавить в корзину', 'Себетке қосу')}: ${name}`} onClick={() => quickAdd(b)}>+</button>
            </div>
          );
        })}
      </div>

      {champion && (
        <section aria-label={t('Новинка CHAMPION', 'CHAMPION жаңалығы')} className="hm-champ">
          <Link href={`/product/${champion.slug}`} className="hm-champ-link">
            <ChampionHeader bodyMinHeight={230}>
              <div className="hm-champ-body">
                <div aria-hidden="true" className="hov hm-champ-img">
                  <ProductImg path={champion.image} />
                </div>
                <div className="disp" style={{ fontSize: 22, fontWeight: 800, marginTop: 6, lineHeight: 1.05, overflowWrap: 'anywhere' }}>{tx(champion.name, champion.nameKk)}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, lineHeight: 1.35, maxWidth: 260 }}>{champText}</div>
                <span className="btn hm-champ-btn">
                  {t('Попробовать', 'Байқап көру')} · <PriceText text={priceFromL(champion, lang)} size={14} />
                </span>
              </div>
            </ChampionHeader>
          </Link>
          <div className="hm-champ-info">
            <h2 className="disp hm-h2"><BoltMark size={34} />{tx(champion.name, champion.nameKk)}</h2>
            <p className="hm-champ-d">{tx(champion.description, champion.descriptionKk) || champText}</p>
            <VariantPills product={champion} />
            <Link href={`/product/${champion.slug}`} className="btn hm-champ-cta">{t('Попробовать', 'Байқап көру')} →</Link>
          </div>
        </section>
      )}

      <div className="hm-duo">
        <ComboBuilder />
        <LastOrderCard />
      </div>

      <section aria-label={t('Как мы работаем', 'Біз қалай жұмыс істейміз')} className="hm-how">
        <h2 className="disp hm-h2"><BoltMark size={26} />{t('Как мы работаем', 'Біз қалай жұмыс істейміз')}</h2>
        <div className="hm-steps">
          {steps.map(([title, d], i) => (
            <div key={title} className="hm-step">
              <span className="disp hm-step-n">{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div className="hm-step-t">{title}</div>
                <div className="hm-step-d">{d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-label={t('Филиалы', 'Филиалдар')} className="hm-branches">
        <div>
          <h2 className="disp hm-h2">{branchTitle}</h2>
          <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>{t('Ежедневно 00:00–24:00 · перерыв 06:00–08:00', 'Күн сайын 00:00–24:00 · үзіліс 06:00–08:00')}</div>
        </div>
        <div className="hm-br-chips">
          {branches.map((b) => {
            const open = now ? isBranchOpen(b.id, hours, now) && b.accepts_orders : null;
            return (
              <span key={b.id} className="hm-br-chip">
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: open == null ? '#E5DACB' : open ? '#2E8B3F' : '#B3A89B' }} />
                {b.short_name}
                <span className="hm-sr">{open == null ? '' : open ? t(', открыт', ', ашық') : t(', закрыт', ', жабық')}</span>
              </span>
            );
          })}
        </div>
        <Link href="/branches" className="btn hm-br-link">{t('Адреса и карта филиалов', 'Филиалдардың мекенжайлары мен картасы')} →</Link>
      </section>

      <div className="hm-foot">
        <BrandFooter branches={branches} />
      </div>
    </div>
  );
}

