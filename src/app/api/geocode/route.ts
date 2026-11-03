import { NextResponse } from 'next/server';

// Controlled proxy to OpenStreetMap Nominatim: cached, throttled to 1 req/s (Nominatim policy),
// limited to the Almaty area. Replace NOMINATIM_URL with a self-hosted instance for heavy traffic.
const BASE = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const UA = 'TOK-BURGER-delivery/1.0';
const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 24 * 3600 * 1000;
let last = 0;
let chain: Promise<void> = Promise.resolve();

function throttle(): Promise<void> {
  chain = chain.then(async () => {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
  });
  return chain;
}

async function cached(key: string, url: string) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  await throttle();
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ru' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('GEOCODER_' + res.status);
  const data = await res.json();
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), data });
  return data;
}

function shortAddress(a: Record<string, string> | undefined, fallback: string): string {
  if (!a) return fallback;
  const street = a.road || a.pedestrian || a.neighbourhood || a.suburb;
  return [street, a.house_number].filter(Boolean).join(', ') || fallback;
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  try {
    if (sp.has('q')) {
      const q = (sp.get('q') || '').trim().slice(0, 120);
      if (q.length < 3) return NextResponse.json({ results: [] });
      const url = `${BASE}/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=kz&viewbox=76.70,43.40,77.20,43.10&bounded=1&q=${encodeURIComponent(q + ', Алматы')}`;
      const data = (await cached('q:' + q.toLowerCase(), url)) as Array<{ lat: string; lon: string; display_name: string; address?: Record<string, string> }>;
      return NextResponse.json({
        results: data.map((r) => ({ lat: +r.lat, lon: +r.lon, label: shortAddress(r.address, r.display_name.split(',').slice(0, 2).join(',')) })),
      });
    }
    const lat = Number(sp.get('lat')), lon = Number(sp.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 42.9 || lat > 43.6 || lon < 76.5 || lon > 77.4) {
      return NextResponse.json({ error: 'OUT_OF_CITY' }, { status: 400 });
    }
    const key = `r:${lat.toFixed(4)},${lon.toFixed(4)}`;
    const data = (await cached(key, `${BASE}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lon}`)) as { display_name?: string; address?: Record<string, string> };
    return NextResponse.json({ label: shortAddress(data.address, `${lat.toFixed(5)}, ${lon.toFixed(5)}`) });
  } catch {
    return NextResponse.json({ error: 'GEOCODER_UNAVAILABLE' }, { status: 502 });
  }
}
