# Toq Burger — питч-видео (Еркебұлан Тоқтарға)

100 секундтық, 1920×1080, 60 fps, бумажный коллаж стиліндегі видео. Дауысы қазақша (Microsoft `kk-KZ-DauletNeural`).

**Дайын видео:** [`video/toq-burger-pitch.mp4`](video/toq-burger-pitch.mp4) (~84 МБ, WhatsApp-қа жіберуге болады, Git LFS арқылы сақталған).
Толық сапалы мастер (~385 МБ) `render.mjs` арқылы `out/` ішіне жасалады және репоға салынбайды.

## Файлдар
- `script.json` — дауыс мәтіні (әр сахнаға бір сөйлем), дауыс пен жылдамдық.
- `timeline.js` — сахналардың уақыты, дауыс сөздеріне байланған кадр/дыбыс оқиғалары.
- `index.html` — анимацияның өзі (`renderAt(t)`). Браузерде `index.html?play` немесе `index.html?t=30` деп ашып көруге болады.
- `audio.mjs` — музыка + SFX синтезі, дауысты орналастыру, ducking → `mix.wav`.
- `render.mjs` — headless Edge арқылы барлық кадрды рендерлеп, MP4 жасайды.
- `shots/` — нақты сайттың скриншоттары, `img/` — бургер суреттері мен логотип.

## Қайта жасау
```bash
npm install
node tts.mjs            # дауысты қайта генерациялау (басқа дауыс: node tts.mjs kk-KZ-AigulNeural)
node prep.mjs           # сөз уақыттарын vo/words.js-ке жинау
node audio.mjs          # mix.wav
node render.mjs         # out/toq-burger-pitch.mp4 (~25–30 мин, 4 ағын)
```
Мәтінді өзгерткен соң `tts.mjs` → `prep.mjs` → `audio.mjs` → `render.mjs` ретімен қайта іске қосыңыз.
Сөйлем ұзарса, `timeline.js` ішіндегі сахна шекараларын (`a`, `b`, `vo`) сәйкестендіріңіз.

Талап: Node 22+, ffmpeg, Microsoft Edge.
