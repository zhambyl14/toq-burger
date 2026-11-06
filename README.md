# TOK BURGER — платформа доставки (Алматы)

Next.js 16 + Supabase. Клиентский сайт, кухня/оператор, курьер, админ-панель, вход через WhatsApp-код.

## Запуск локально
```bash
npm ci
cp .env.example .env.local   # заполнить ключи Supabase и секреты
npm run dev                  # http://localhost:3000
```

## Проверки
```bash
npm run typecheck && npm run lint
npm test            # unit: цены, корзина, выбор филиала, телефоны
npm run test:db     # 50+ проверок БД/RLS на PGlite (миграции из supabase/migrations)
npm run build
BASE=http://localhost:3000 node --env-file=.env.local tests/e2e/smoke.mjs   # E2E против реального Supabase
```

## База данных
Миграции: `supabase/migrations`. Применить: `npx supabase db push --remote` (проект `lriekmwkbrllwixdlbux`).
Уже применённые миграции не редактировать — только новые файлы.

## Роли и тестовые номера
Сотрудники предварительно разрешаются по телефону (`staff_invites`) и получают роль при первом входе.
Тестовые номера (код из `TEST_OTP_CODE`, WhatsApp не отправляется): `+77474005347` админ, `+77474005348` кухня/оператор (все 5 филиалов), `+77474005350` курьер, `+77474005349` клиент.

## Деплой
- Сайт: Cloudflare Workers — см. [docs/DEPLOY_CLOUDFLARE.md](docs/DEPLOY_CLOUDFLARE.md).
- WhatsApp-бот: [whatsapp-bot/README.md](whatsapp-bot/README.md).

Подробнее: [ARCHITECTURE.md](ARCHITECTURE.md), [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).
