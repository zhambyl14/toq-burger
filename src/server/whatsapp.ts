import 'server-only';

/**
 * WhatsAppService — delivery of OTP codes.
 *
 * Production provider: our own bot service (./whatsapp-bot, whatsapp-web.js) reachable at
 * WHATSAPP_BOT_URL and protected with WHATSAPP_BOT_TOKEN. NOTE: whatsapp-web.js is an
 * unofficial client; WhatsApp may block the sender number. The interface allows switching to
 * the official Cloud API later without touching the auth flow.
 *
 * Dev provider: used only when NODE_ENV !== 'production' and no bot is configured.
 * It does NOT deliver anything and says so.
 */
export interface WhatsAppService {
  readonly mode: 'bot' | 'dev-mock';
  sendOtp(phone: string, code: string): Promise<void>;
  sendMessage(phone: string, message: string): Promise<void>;
  checkConfiguration(): Promise<{ ok: boolean; detail: string }>;
}

export function otpMessage(code: string): string {
  return `TOK BURGER\n\nВаш код подтверждения: ${code}\n\nКод действителен 5 минут.\n\nНикому не сообщайте этот код.`;
}

class BotProvider implements WhatsAppService {
  readonly mode = 'bot' as const;
  constructor(private url: string, private token: string) {}

  private async call(path: string, body?: unknown) {
    const res = await fetch(this.url.replace(/\/$/, '') + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`WHATSAPP_SEND_FAILED_${res.status}`);
    return res.json().catch(() => ({}));
  }
  async sendMessage(phone: string, message: string) {
    await this.call('/send', { phone, message });
  }
  async sendOtp(phone: string, code: string) {
    await this.sendMessage(phone, otpMessage(code));
  }
  async checkConfiguration() {
    try {
      const r = (await this.call('/health')) as { ready?: boolean };
      return { ok: !!r.ready, detail: r.ready ? 'WhatsApp bot ready' : 'WhatsApp bot not logged in (scan QR)' };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }
}

class DevMockProvider implements WhatsAppService {
  readonly mode = 'dev-mock' as const;
  async sendMessage() {
    /* intentionally nothing: development mode, no delivery */
  }
  async sendOtp() {
    /* code is returned to the dev UI by the route instead; never logged */
  }
  async checkConfiguration() {
    return { ok: false, detail: 'DEV MOCK: WhatsApp is not configured, messages are not delivered' };
  }
}

export function whatsapp(): WhatsAppService | null {
  const url = process.env.WHATSAPP_BOT_URL;
  const token = process.env.WHATSAPP_BOT_TOKEN;
  if (url && token) return new BotProvider(url, token);
  if (process.env.NODE_ENV !== 'production') return new DevMockProvider();
  return null; // production without provider => sending is refused, never faked
}
