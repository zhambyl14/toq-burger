// TOK BURGER — WhatsApp OTP bot (whatsapp-web.js).
// Contract used by the site (src/server/whatsapp.ts):
//   GET  /health                       -> { ready: boolean }
//   POST /send  { phone, message }     -> 2xx only if WhatsApp accepted the message
//   GET  /qr                           -> PNG of the current login QR (token protected)
// All endpoints except /health require: Authorization: Bearer <WHATSAPP_BOT_TOKEN>
//
// NOTE: whatsapp-web.js is an UNOFFICIAL client. WhatsApp can restrict or ban the sender number.
// This service is deliberately slow and polite to reduce that risk. Never log OTP codes or message bodies.

import express from 'express';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import { timingSafeEqual, createHash, randomInt } from 'node:crypto';
import wweb from 'whatsapp-web.js';

const { Client, LocalAuth } = wweb;

// ---------------- config ----------------
const env = (k, d) => (process.env[k] ?? '').trim() || d;
const num = (k, d) => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) && v > 0 ? v : d;
};
const PORT = num('PORT', 3001);
const HOST = env('HOST', '0.0.0.0');
const TOKEN = env('WHATSAPP_BOT_TOKEN', '');
const GAP_MIN_MS = num('GAP_MIN_MS', 2000);
const GAP_MAX_MS = num('GAP_MAX_MS', 6000);
const PER_RECIPIENT_10MIN = num('PER_RECIPIENT_10MIN', 3);
const PER_RECIPIENT_DAY = num('PER_RECIPIENT_DAY', 8);
const GLOBAL_PER_HOUR = num('GLOBAL_PER_HOUR', 120);
const GLOBAL_PER_DAY = num('GLOBAL_PER_DAY', 600);
const QUEUE_MAX = num('QUEUE_MAX', 50);
const SEND_TIMEOUT_MS = num('SEND_TIMEOUT_MS', 45000);
const AUTO_REPLY = env(
  'AUTO_REPLY_TEXT',
  'Здравствуйте! Это автоматический номер TOK BURGER для кодов входа. Заказать можно на сайте, по вопросам заказа — через раздел «Поддержка» в профиле. Рахмет!',
);
const SESSION_DIR = env('SESSION_DIR', './.wwebjs_auth');

if (!TOKEN || TOKEN.length < 24) {
  console.error('[fatal] WHATSAPP_BOT_TOKEN is missing or too short (min 24 chars). See .env.example');
  process.exit(1);
}

// ---------------- helpers ----------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (a, b) => randomInt(Math.min(a, b), Math.max(a, b) + 1);
const mask = (p) => (p && p.length > 6 ? `${p.slice(0, 4)}***${p.slice(-2)}` : '***');
const log = (...a) => console.log(new Date().toISOString(), ...a);
const tokenHash = createHash('sha256').update(TOKEN).digest();

function authorized(req) {
  const h = req.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return false;
  const given = createHash('sha256').update(m[1].trim()).digest();
  return timingSafeEqual(given, tokenHash);
}

/** +7XXXXXXXXXX (Kazakhstan mobile). Returns digits for WhatsApp id or null. */
function normalizePhone(p) {
  if (typeof p !== 'string') return null;
  const d = p.replace(/\D/g, '');
  let ten = null;
  if (d.length === 10) ten = d;
  else if (d.length === 11 && (d[0] === '7' || d[0] === '8')) ten = d.slice(1);
  if (!ten || !/^7\d{9}$/.test(ten)) return null;
  return '7' + ten;
}

// OTP text variation: same meaning, always contains the code, validity and the warning. No links.
const OTP_TEMPLATES = [
  (c) => `TOK BURGER

Растау коды / Ваш код подтверждения: ${c}

Код 5 минут жарамды / Код действителен 5 минут.
Кодты ешкімге айтпаңыз / Никому не сообщайте этот код.`,
  (c) => `TOK BURGER

Кіру коды / Код для входа: ${c}

5 минут жарамды / Действует 5 минут.
Ешкімге айтпаңыз / Никому не сообщайте этот код.`,
  (c) => `Сәлеметсіз бе! / Здравствуйте!
TOK BURGER коды / Ваш код TOK BURGER: ${c}

5 минут жарамды / Действителен 5 минут. Ешкімге айтпаңыз / Никому не сообщайте.`,
  (c) => `TOK BURGER · кіру / вход

${c} — растау коды / код подтверждения.
5 минут жарамды, ешкімге айтпаңыз / действует 5 минут, никому не сообщайте.`,
];
function varyMessage(message) {
  const m = /\b(\d{6})\b/.exec(message);
  if (!m || !/TOK BURGER/i.test(message)) return message; // not an OTP message: send as is
  return OTP_TEMPLATES[randomInt(0, OTP_TEMPLATES.length)](m[1]);
}

// ---------------- rate limits (in memory) ----------------
const recipientLog = new Map(); // digits -> number[] timestamps
const globalLog = []; // timestamps
const autoReplied = new Map(); // chatId -> day string

function prune(now) {
  const day = 24 * 3600e3;
  while (globalLog.length && now - globalLog[0] > day) globalLog.shift();
  for (const [k, arr] of recipientLog) {
    const kept = arr.filter((t) => now - t < day);
    if (kept.length) recipientLog.set(k, kept);
    else recipientLog.delete(k);
  }
}
function limitReason(digits, now) {
  prune(now);
  const arr = recipientLog.get(digits) ?? [];
  if (arr.filter((t) => now - t < 10 * 60e3).length >= PER_RECIPIENT_10MIN) return 'RECIPIENT_LIMIT_10MIN';
  if (arr.length >= PER_RECIPIENT_DAY) return 'RECIPIENT_LIMIT_DAY';
  if (globalLog.filter((t) => now - t < 3600e3).length >= GLOBAL_PER_HOUR) return 'GLOBAL_LIMIT_HOUR';
  if (globalLog.length >= GLOBAL_PER_DAY) return 'GLOBAL_LIMIT_DAY';
  return null;
}
function recordSend(digits, now) {
  globalLog.push(now);
  const arr = recipientLog.get(digits) ?? [];
  arr.push(now);
  recipientLog.set(digits, arr);
}

// ---------------- WhatsApp client ----------------
let client = null;
let ready = false;
let lastQr = null;
let reconnectAttempt = 0;
let shuttingDown = false;
let lastSendAt = 0;
let lastRecipient = null;

function createClient() {
  const c = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
      ],
      ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}),
    },
  });

  c.on('qr', (qr) => {
    lastQr = qr;
    ready = false;
    log('[wa] scan this QR with the restaurant WhatsApp (Linked devices -> Link a device):');
    qrcodeTerminal.generate(qr, { small: true });
  });
  c.on('authenticated', () => log('[wa] authenticated'));
  c.on('auth_failure', (m) => log('[wa] auth failure:', String(m).slice(0, 120)));
  c.on('ready', () => {
    ready = true;
    lastQr = null;
    reconnectAttempt = 0;
    log('[wa] ready');
  });
  c.on('change_state', (s) => log('[wa] state:', s));
  c.on('disconnected', (reason) => {
    ready = false;
    log('[wa] disconnected:', String(reason).slice(0, 120));
    scheduleReconnect();
  });

  // Polite one-time-per-day auto reply to inbound personal messages (improves sender reputation).
  c.on('message', async (msg) => {
    try {
      if (msg.fromMe || msg.isStatus || msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;
      const today = new Date().toISOString().slice(0, 10);
      if (autoReplied.get(msg.from) === today) return;
      autoReplied.set(msg.from, today);
      if (autoReplied.size > 5000) autoReplied.delete(autoReplied.keys().next().value);
      const chat = await msg.getChat();
      await chat.sendSeen().catch(() => {});
      await sleep(jitter(3000, 9000));
      await chat.sendStateTyping().catch(() => {});
      await sleep(jitter(1500, 3500));
      await chat.sendMessage(AUTO_REPLY);
      await chat.clearState().catch(() => {});
      log('[wa] auto-replied to', mask(msg.from.replace(/@.*/, '')));
    } catch (e) {
      log('[wa] auto-reply failed:', e?.message?.slice(0, 120));
    }
  });

  return c;
}

async function start() {
  client = createClient();
  try {
    await client.initialize();
  } catch (e) {
    log('[wa] initialize failed:', e?.message?.slice(0, 160));
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (shuttingDown) return;
  reconnectAttempt++;
  const delay = Math.min(5 * 60e3, 5000 * 2 ** Math.min(reconnectAttempt - 1, 6)) + jitter(0, 3000);
  log(`[wa] reconnect #${reconnectAttempt} in ${Math.round(delay / 1000)}s`);
  setTimeout(async () => {
    try {
      await client?.destroy();
    } catch {
      /* ignore */
    }
    if (!shuttingDown) start();
  }, delay);
}

// ---------------- send queue (one at a time) ----------------
const queue = [];
let working = false;

function enqueue(job) {
  return new Promise((resolve, reject) => {
    if (queue.length >= QUEUE_MAX) return reject(Object.assign(new Error('QUEUE_FULL'), { status: 503 }));
    queue.push({ job, resolve, reject });
    pump();
  });
}
async function pump() {
  if (working) return;
  working = true;
  while (queue.length) {
    const { job, resolve, reject } = queue.shift();
    try {
      resolve(await job());
    } catch (e) {
      reject(e);
    }
  }
  working = false;
}

async function humanSend(digits, text) {
  if (!ready || !client) throw Object.assign(new Error('NOT_READY'), { status: 503 });

  const now = Date.now();
  const reason = limitReason(digits, now);
  if (reason) throw Object.assign(new Error(reason), { status: 429 });

  // gap between messages to different recipients
  const wait = lastRecipient && lastRecipient !== digits ? lastSendAt + jitter(GAP_MIN_MS, GAP_MAX_MS) - Date.now() : 0;
  if (wait > 0) await sleep(wait);

  const numberId = await client.getNumberId(digits);
  if (!numberId) throw Object.assign(new Error('NOT_ON_WHATSAPP'), { status: 422 });
  const chatId = numberId._serialized;

  const body = varyMessage(text);
  const chat = await client.getChatById(chatId).catch(() => null);
  if (chat) {
    await chat.sendSeen().catch(() => {});
    await chat.sendStateTyping().catch(() => {});
  }
  // typing time roughly proportional to length (bounded)
  await sleep(Math.min(4000, 600 + body.length * jitter(15, 30)));

  const sent = await Promise.race([
    client.sendMessage(chatId, body, { linkPreview: false }),
    sleep(SEND_TIMEOUT_MS).then(() => null),
  ]);
  if (chat) await chat.clearState().catch(() => {});
  if (!sent || !sent.id) throw Object.assign(new Error('SEND_TIMEOUT'), { status: 504 });

  lastSendAt = Date.now();
  lastRecipient = digits;
  recordSend(digits, lastSendAt);
  return { id: sent.id.id };
}

// ---------------- HTTP ----------------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4kb' }));

app.get('/health', (_req, res) => res.json({ ready, queue: queue.length }));

app.get('/qr', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'UNAUTHORIZED' });
  if (ready) return res.status(409).json({ error: 'ALREADY_LOGGED_IN' });
  if (!lastQr) return res.status(404).json({ error: 'NO_QR_YET' });
  res.type('png').send(await QRCode.toBuffer(lastQr, { width: 360, margin: 2 }));
});

app.post('/send', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'UNAUTHORIZED' });
  const { phone, message } = req.body ?? {};
  const digits = normalizePhone(phone);
  if (!digits) return res.status(400).json({ error: 'INVALID_PHONE' });
  if (typeof message !== 'string' || !message.trim() || message.length > 1000) return res.status(400).json({ error: 'INVALID_MESSAGE' });
  if (/https?:\/\/|www\./i.test(message)) return res.status(400).json({ error: 'LINKS_NOT_ALLOWED' });

  try {
    const r = await enqueue(() => humanSend(digits, message));
    log('[send] ok ->', mask(digits));
    res.json({ ok: true, id: r.id });
  } catch (e) {
    const status = e?.status ?? 502;
    log('[send] fail ->', mask(digits), e?.message?.slice(0, 80));
    res.status(status).json({ error: e?.status ? e.message : 'SEND_FAILED' });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

const server = app.listen(PORT, HOST, () => log(`[http] listening on ${HOST}:${PORT}`));
start();

async function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`[sys] ${sig}: shutting down`);
  server.close();
  const deadline = Date.now() + 20000;
  while ((working || queue.length) && Date.now() < deadline) await sleep(250);
  try {
    await client?.destroy();
  } catch {
    /* ignore */
  }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (e) => log('[sys] unhandledRejection:', e?.message?.slice(0, 160)));
