'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '@/components/ui';

type Aspect = '1:1' | '4:3';

const LONG_SIDE = 1200;
const MAX_BYTES = 1024 * 1024;
const PREVIEW_LONG = 480;

function frameSize(aspect: Aspect, long: number): { w: number; h: number } {
  return aspect === '1:1' ? { w: long, h: long } : { w: long, h: Math.round((long * 3) / 4) };
}

interface View { zoom: number; ox: number; oy: number; rot: number; bright: number; aspect: Aspect }
const INITIAL: View = { zoom: 1, ox: 0, oy: 0, rot: 0, bright: 100, aspect: '1:1' };

/** Geometry shared by preview and export. Offsets are fractions of the frame width. */
function geometry(img: HTMLImageElement, v: View, fw: number, fh: number) {
  const odd = v.rot % 2 === 1;
  const rw = odd ? img.naturalHeight : img.naturalWidth;
  const rh = odd ? img.naturalWidth : img.naturalHeight;
  const scale = Math.max(fw / rw, fh / rh) * v.zoom;
  const maxX = Math.max(0, (rw * scale - fw) / 2) / fw;
  const maxY = Math.max(0, (rh * scale - fh) / 2) / fw;
  return { scale, ox: Math.min(maxX, Math.max(-maxX, v.ox)), oy: Math.min(maxY, Math.max(-maxY, v.oy)), maxX, maxY };
}

function paint(ctx: CanvasRenderingContext2D, img: HTMLImageElement, v: View, fw: number, fh: number) {
  const g = geometry(img, v, fw, fh);
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, fw, fh);
  const native = typeof (ctx as { filter?: unknown }).filter === 'string';
  if (native) ctx.filter = `brightness(${v.bright}%)`;
  ctx.translate(fw / 2 + g.ox * fw, fh / 2 + g.oy * fw);
  ctx.rotate((v.rot * Math.PI) / 2);
  ctx.scale(g.scale, g.scale);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.restore();
  // Safari/iOS lack CanvasRenderingContext2D.filter: apply brightness per pixel instead
  if (!native && v.bright !== 100) {
    const data = ctx.getImageData(0, 0, fw, fh);
    const k = v.bright / 100, p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      p[i] = Math.min(255, p[i] * k); p[i + 1] = Math.min(255, p[i + 1] * k); p[i + 2] = Math.min(255, p[i + 2] * k);
    }
    ctx.putImageData(data, 0, 0);
  }
}

function toBlob(c: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return new Promise((res) => c.toBlob(res, type, q));
}

async function encode(img: HTMLImageElement, v: View): Promise<Blob | null> {
  let long = LONG_SIDE;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { w, h } = frameSize(v.aspect, long);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    paint(ctx, img, v, w, h);
    let blob = await toBlob(c, 'image/webp', 0.85);
    let q = 0.85;
    if (!blob || blob.type !== 'image/webp') {
      q = 0.85;
      blob = await toBlob(c, 'image/jpeg', q);
    }
    while (blob && blob.size > MAX_BYTES && q > 0.5) {
      q -= 0.1;
      blob = await toBlob(c, blob.type, q);
    }
    if (blob && blob.size <= MAX_BYTES) return blob;
    long = Math.round(long * 0.8);
  }
  return null;
}

const btn: React.CSSProperties = { minHeight: 40, padding: '0 14px', borderRadius: 12, background: '#F3EADF', color: '#141210', fontWeight: 800, fontSize: 13 };

export function ImageEditor({ file, onDone, onCancel }: { file: File; onDone: (blob: Blob) => void; onCancel: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [v, setV] = useState<View>(INITIAL);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => { toast('Не удалось открыть изображение'); onCancel(); };
    im.src = url;
    return () => { im.onload = null; im.onerror = null; URL.revokeObjectURL(url); };
  }, [file, onCancel]);

  const prev = frameSize(v.aspect, PREVIEW_LONG);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!img || !ctx) return;
    paint(ctx, img, v, prev.w, prev.h);
  }, [img, v, prev.w, prev.h]);

  useEffect(() => {
    // capture phase + stopPropagation: Esc closes only the editor, not the surrounding drawer
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.stopPropagation(); onCancel(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onCancel]);

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!img) return;
    const g = geometry(img, v, prev.w, prev.h);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: g.ox, oy: g.oy };
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const k = prev.w / e.currentTarget.getBoundingClientRect().width;
    const dx = ((e.clientX - d.x) * k) / prev.w;
    const dy = ((e.clientY - d.y) * k) / prev.w;
    setV((s) => ({ ...s, ox: d.ox + dx, oy: d.oy + dy }));
  };
  const up = () => { drag.current = null; };

  const done = async () => {
    if (!img) return;
    setBusy(true);
    const blob = await encode(img, v);
    setBusy(false);
    if (!blob) return toast('Не удалось подготовить фото (больше 1 МБ). Уменьшите масштаб или выберите другое фото');
    onDone(blob);
  };

  // portal: a fixed overlay inside an animated (transformed) drawer would be clipped
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Редактор фото" style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(20,18,16,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ background: '#fff', borderRadius: 22, padding: 18, width: 'min(100%, 540px)', maxHeight: '100%', overflowY: 'auto' }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>Корректировка фото</div>
        <div style={{ background: '#FFF1E0', borderRadius: 16, display: 'flex', justifyContent: 'center', padding: 8, minHeight: 120 }}>
          {img ? (
            <canvas ref={canvasRef} width={prev.w} height={prev.h} aria-label="Область обрезки. Перетаскивайте фото, чтобы сдвинуть"
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
              style={{ width: '100%', maxWidth: 420, height: 'auto', borderRadius: 12, touchAction: 'none', cursor: 'grab', background: '#fff' }} />
          ) : <div style={{ alignSelf: 'center', fontWeight: 700, fontSize: 13 }}>Загрузка…</div>}
        </div>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#6B6258', marginTop: 12 }}>МАСШТАБ
          <input type="range" min={1} max={4} step={0.01} value={v.zoom} aria-label="Масштаб" onChange={(e) => setV((s) => ({ ...s, zoom: Number(e.target.value) }))} style={{ width: '100%', accentColor: '#FF6A0A' }} />
        </label>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#6B6258', marginTop: 4 }}>ЯРКОСТЬ
          <input type="range" min={50} max={150} step={1} value={v.bright} aria-label="Яркость" onChange={(e) => setV((s) => ({ ...s, bright: Number(e.target.value) }))} style={{ width: '100%', accentColor: '#FF6A0A' }} />
        </label>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button type="button" className="btn" aria-label="Повернуть на 90 градусов" onClick={() => setV((s) => ({ ...s, rot: (s.rot + 1) % 4 }))} style={btn}>Повернуть 90°</button>
          <button type="button" className="btn" aria-label="Квадратная рамка 1 к 1" aria-pressed={v.aspect === '1:1'} onClick={() => setV((s) => ({ ...s, aspect: '1:1' }))} style={v.aspect === '1:1' ? { ...btn, background: '#141210', color: '#fff' } : btn}>1:1</button>
          <button type="button" className="btn" aria-label="Рамка 4 к 3" aria-pressed={v.aspect === '4:3'} onClick={() => setV((s) => ({ ...s, aspect: '4:3' }))} style={v.aspect === '4:3' ? { ...btn, background: '#141210', color: '#fff' } : btn}>4:3</button>
          <button type="button" className="btn" aria-label="Сбросить все настройки" onClick={() => setV(INITIAL)} style={btn}>Сбросить</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button type="button" className="btn" aria-label="Отмена" onClick={onCancel} style={{ ...btn, flex: 1, height: 48 }}>Отмена</button>
          <button type="button" className="btn primary" aria-label="Готово" disabled={!img || busy} onClick={done} style={{ flex: 2, height: 48, borderRadius: 24 }}>{busy ? 'Обработка…' : 'Готово'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
