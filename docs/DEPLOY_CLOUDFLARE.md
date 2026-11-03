# Cloudflare Workers-ке автоматты деплой

Сайт Next.js 16 → `@opennextjs/cloudflare` адаптері арқылы Cloudflare Workers-та жұмыс істейді.
GitHub репосына (`zhambyl14/toq-burger`, `main` тармағы) әр push → Cloudflare өзі жинап, жариялайды.

## 1. «Set up your application» экраны (Workers Builds)

| Өріс | Мән |
|---|---|
| Repository | `zhambyl14/toq-burger` |
| Project / Worker name | `toq-burger` (wrangler.jsonc ішіндегі `name`-мен **бірдей** болуы керек) |
| Production branch | `main` |
| Build command | `npx opennextjs-cloudflare build` |
| Deploy command | `npx opennextjs-cloudflare deploy` |
| Non-production branch deploy command | `npx opennextjs-cloudflare upload` (Preview builds қоссаңыз) |
| Root directory (Advanced settings → Path) | `/` |
| Enable Preview builds | қалауыңызша |
| Protect with Cloudflare Access | **өшірулі** (әйтпесе клиенттер сайтқа кіре алмайды) |

`npx wrangler deploy` емес, `npx opennextjs-cloudflare deploy` қойыңыз: ол OpenNext кэшін де дұрыс жүктейді.

## 2. Build variables (Advanced settings → Build variables)

Бұлар **жинау кезінде** кодқа енгізіледі (`NEXT_PUBLIC_*`):

| Аты | Мән |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://lriekmwkbrllwixdlbux.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` кілті |
| `NEXT_PUBLIC_PAYMENT_METHODS` | `CASH` (Kaspi/онлайн қосылғанда: `CASH,KASPI_QR`) |
| `NODE_VERSION` | `22` |

## 3. Worker → Settings → Variables and Secrets (runtime)

Алғашқы деплойдан кейін: **Workers & Pages → toq-burger → Settings → Variables and Secrets → Add**.
Түрі **Secret** (құпия) болсын:

| Аты | Түрі | Ескерту |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Supabase → Settings → API → `service_role`. Ешкімге көрсетпеңіз |
| `OTP_HASH_SECRET` | Secret | 64 таңбалы кездейсоқ жол (`.env.local`-дағымен бірдей) |
| `WHATSAPP_BOT_URL` | Secret | бот мекенжайы, мыс. `https://bot.example.com` |
| `WHATSAPP_BOT_TOKEN` | Secret | ботпен бірдей токен |
| `TEST_OTP_PHONES` | Secret | тест нөмірлері үтір арқылы; өшіру үшін жойыңыз |
| `TEST_OTP_CODE` | Secret | тест коды |
| `AUTH_INTERNAL_EMAIL_DOMAIN` | Text | `mail.ru` |
| `NEXT_PUBLIC_SUPABASE_URL` | Text | 2-бөліммен бірдей (runtime үшін де) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Text | 2-бөліммен бірдей |
| `NEXT_PUBLIC_PAYMENT_METHODS` | Text | 2-бөліммен бірдей |

Айнымалыларды өзгерткеннен кейін **Deployments → Retry/Redeploy** жасаңыз (Build variables өзгерсе — міндетті түрде қайта жинау).

> Нақты кілттерді ешқашан репоға немесе құжатқа жазбаңыз. `.env*` файлдары `.gitignore`-да.

## 4. Локалды тексеру

```bash
npm run preview   # opennextjs-cloudflare build + wrangler-де локалды іске қосу
npm run deploy    # қолмен деплой (wrangler login керек)
```

Локалды preview үшін құпияларды `.dev.vars` файлына жазыңыз (ол `.gitignore`-да).

## 5. Ескертпелер

- Суреттер Cloudflare Images-сіз беріледі (`images.unoptimized: true`).
- ISR кэші әзірге R2-сіз (жариялау үшін ештеңе құру керек емес). Тұрақты кэш керек болса — `open-next.config.ts` ішіндегі нұсқаулық бойынша R2 bucket қосыңыз.
- WhatsApp бот Cloudflare-да **емес**, бөлек компьютерде/VPS-те жұмыс істейді (`whatsapp-bot/README.md`).
