// Synthesises the music bed + SFX, places the Kazakh voiceover, ducks and masters to mix.wav.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const SR = 48000;
const ctx = {};
new Function("ctx", fs.readFileSync("vo/words.js", "utf8") + fs.readFileSync("timeline.js", "utf8").replace("var TL =", "ctx.TL =") + "; ctx.VO_DUR = VO_DUR;")(ctx);
const TL = ctx.TL;
const DUR = TL.DURATION, START = TL.START, END = TL.END, N = Math.round(DUR * SR);
const A9 = TL.byId.s9.a, A10 = TL.byId.s10.a;

const buf = () => [new Float32Array(N), new Float32Array(N)];
const MUS = buf(), SFX = buf(), VO = new Float32Array(N), REV = buf();

let seed = 99;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const noise = () => rnd() * 2 - 1;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// Adds a mono generator f(i, tLocal) into a stereo bus with pan and optional reverb send.
function add(bus, t0, dur, f, { gain = 1, pan = 0, send = 0 } = {}) {
  // t0 is story time; sample 0 of the mix is TL.START
  const s0 = Math.round((t0 - START) * SR), n = Math.min(N - s0, Math.round(dur * SR));
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = Math.max(0, -s0); i < n; i++) {
    const v = f(i, i / SR);
    bus[0][s0 + i] += v * gl; bus[1][s0 + i] += v * gr;
    if (send) { REV[0][s0 + i] += v * gl * send; REV[1][s0 + i] += v * gr * send; }
  }
}
// One-pole filters built per voice.
const lp = (fc) => { const a = Math.exp(-2 * Math.PI * fc / SR); let y = 0; return (x, f2) => { const aa = f2 ? Math.exp(-2 * Math.PI * f2 / SR) : a; y = (1 - aa) * x + aa * y; return y; }; };
const hp = (fc) => { const l = lp(fc); return (x) => x - l(x); };
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));

// ---------------- instruments ----------------
function keys(t0, midis, { gain = .12, len = 1.4, bright = 1 } = {}) {
  midis.forEach((m, k) => {
    const f = mtof(m), ph = rnd() * 6;
    add(MUS, t0 + k * .008, len + .4, (i, t) => {
      const e = env(t, .006, len * .45) * (t > len ? Math.exp(-(t - len) / .08) : 1);
      const trem = 1 + .12 * Math.sin(2 * Math.PI * 4.5 * t);
      return e * trem * (Math.sin(2 * Math.PI * f * t + ph) + .35 * bright * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 6) + .12 * bright * Math.sin(6 * Math.PI * f * t) * Math.exp(-t * 9));
    }, { gain: gain / midis.length * 2.2, pan: (k / midis.length - .5) * .6, send: .35 });
  });
}
function pad(t0, midis, len, { gain = .05, cutoff = 900 } = {}) {
  midis.forEach((m, k) => {
    [-.07, .07].forEach((det, j) => {
      const f = mtof(m + det), filt = lp(cutoff);
      add(MUS, t0, len + 1, (i, t) => {
        const e = clamp(t / .6) * (t > len ? Math.exp(-(t - len) / .4) : 1);
        const saw = 2 * ((f * t + k * .13 + j * .5) % 1) - 1;
        return e * filt(saw);
      }, { gain: gain / midis.length, pan: j ? .5 : -.5, send: .5 });
    });
  });
}
function bass(t0, m, len = .4, gain = .32) {
  const f = mtof(m);
  add(MUS, t0, len + .08, (i, t) => {
    const e = clamp(t / .004) * Math.exp(-t / (len * .9)) * (t > len ? Math.exp(-(t - len) / .02) : 1);
    return e * (Math.sin(2 * Math.PI * f * t) + .3 * Math.sin(4 * Math.PI * f * t) + .1 * Math.sin(6 * Math.PI * f * t));
  }, { gain });
}
function kick(t0, gain = .55) {
  let ph = 0;
  add(MUS, t0, .45, (i, t) => { const f = 45 + 95 * Math.exp(-t * 28); ph += 2 * Math.PI * f / SR; return Math.sin(ph) * Math.exp(-t * 7) + (t < .004 ? noise() * .4 : 0); }, { gain });
}
function clap(t0, gain = .22) {
  const h = hp(900), l = lp(5000);
  add(MUS, t0, .3, (i, t) => {
    const burst = (t < .01 || (t > .012 && t < .02) || (t > .024 && t < .03)) ? 1 : Math.exp(-(t - .03) * 22);
    return l(h(noise())) * burst + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30) * .3;
  }, { gain, send: .25 });
}
function hat(t0, gain = .06, open = false, pan = .25) {
  const h = hp(7000);
  add(MUS, t0, open ? .25 : .06, (i, t) => h(noise()) * Math.exp(-t * (open ? 14 : 70)), { gain, pan });
}
function shaker(t0, gain = .035) {
  const h = hp(4500), l = lp(9000);
  add(MUS, t0, .09, (i, t) => l(h(noise())) * Math.sin(Math.PI * clamp(t / .09)), { gain, pan: -.35 });
}
function pluck(t0, m, gain = .07, pan = 0) {
  const f = mtof(m), filt = lp(2400);
  add(MUS, t0, .35, (i, t) => filt(((f * t) % 1 < .5 ? 1 : -1)) * Math.exp(-t * 11), { gain, pan, send: .4 });
}
function riser(t0, len, gain = .12) {
  const filt = lp(200);
  add(MUS, t0, len, (i, t) => { const p = t / len; return filt(noise(), 200 + p * p * 9000) * p * p; }, { gain, send: .3 });
}

// ---------------- arrangement (120 BPM, bar = 2 s) ----------------
const CH = [
  { k: [53, 56, 60, 63, 67], b: 41 }, // Fm9
  { k: [49, 53, 56, 60, 65], b: 37 }, // Dbmaj7
  { k: [56, 60, 63, 67], b: 44 },     // Abmaj7
  { k: [51, 55, 58, 60, 67], b: 39 }, // Eb6
];
const BEAT = .5, BAR = 2;
const FINAL_HIT = END - 3.6;
const sect = (t) => t < -0.5 ? "hook" : t < 0 ? "gap" : t < 6.5 ? "intro" : t < 15.25 ? "tension" : t < 16 ? "lift" : t < 76 ? "groove" : t < A9 - .5 ? "break" : t < FINAL_HIT ? "final" : "end";
for (let bar = Math.floor(START / BAR); bar * BAR < FINAL_HIT; bar++) {
  const t = bar * BAR, ch = CH[((bar % 4) + 4) % 4];
  const s = sect(t), s2 = sect(t + 1);
  const full = s === "groove" || s === "final" || s === "hook";
  if (s === "gap") continue;
  // keys: stabs on 1, 2&, 4 (only 1 in the intro)
  if (s === "intro") keys(t, ch.k, { gain: .09, len: 1.8, bright: .5 });
  else if (s === "hook") {
    keys(t, ch.k, { gain: .1, len: .9, bright: 1.2 });
    keys(t + 1.5 * BEAT, ch.k, { gain: .07, len: .3 });
    keys(t + 3 * BEAT, ch.k, { gain: .07, len: .3 });
    keys(t + 3.5 * BEAT, ch.k.map((m) => m + 12).slice(0, 3), { gain: .04, len: .2 });
  }
  else if (s !== "lift") {
    keys(t, ch.k, { gain: full ? .11 : .09, len: .9 });
    keys(t + 1.5 * BEAT, ch.k, { gain: full ? .07 : .05, len: .3 });
    keys(t + 3 * BEAT, ch.k, { gain: full ? .08 : .06, len: .45 });
  }
  if (s === "intro" || s === "break" || s === "tension") pad(t, ch.k.map((m) => m - 12).slice(0, 3), BAR, { gain: s === "break" ? .06 : .045, cutoff: s === "intro" ? 600 : 1000 });
  // bass
  if (s !== "intro" && s !== "lift" && t >= START + 2) {
    const r = ch.b;
    [[0, .35], [.75, .2], [1.5, .3], [2.5, .2], [3.25, .2]].forEach(([b, l], k) => {
      if (s === "tension" && k % 2) return;
      bass(t + b * BEAT, k === 3 ? r + 12 : r, l * (s === "break" ? 1.4 : 1), s === "break" ? .26 : .32);
    });
  }
  // drums
  for (let b = 0; b < 4; b++) {
    const tb = t + b * BEAT;
    if (tb >= 15.4 && tb < 16) continue;
    const sb = sect(tb);
    if (sb === "gap" || sb === "end") continue;
    if (sb === "hook") {
      if (tb < START + .4) continue;
      if (b === 0 || b === 2) kick(tb, tb < START + 2 ? .3 : .5);
      if (b === 1 || b === 3) clap(tb, .18);
      hat(tb, .045); hat(tb + .27, .035);
      for (let q = 0; q < 4; q++) shaker(tb + q * .125, q % 2 ? .015 : .028);
      continue;
    }
    if (sb === "intro") { hat(tb, .03); continue; }
    if (sb === "tension") { if (b === 0) kick(tb, .45); if (b === 2) clap(tb, .16); hat(tb, .04); hat(tb + .25, .025); continue; }
    if (sb === "break") { if (b === 0) kick(tb, .35); hat(tb + .25, .03); continue; }
    if (sb !== "groove" && sb !== "final") continue;
    if (b === 0 || b === 2) kick(tb);
    if (b === 1) kick(tb + .25, .35);
    if (b === 1 || b === 3) clap(tb);
    const swing = .27;
    hat(tb, .055); hat(tb + swing, .04, b === 3 && bar % 2 === 1);
    if (tb >= 65 && tb < 76) { hat(tb + .125, .025, false, -.3); hat(tb + .375, .025, false, -.3); }
    if (tb >= 24 && tb < 53) { for (let q = 0; q < 4; q++) shaker(tb + q * .125, q % 2 ? .02 : .035); }
    if (tb >= 53 && tb < 65) { for (let q = 0; q < 4; q++) pluck(tb + q * .125, ch.k[(b * 4 + q) % ch.k.length] + 12, .05, q % 2 ? .4 : -.4); }
  }
}
riser(13.4, 2.0, .1);
riser(A9 - 2.1, 2.1, .1);
riser(A10 - 1.6, 1.4, .07);
// final chord ring-out + last hit
keys(FINAL_HIT, [44, 56, 60, 63, 67, 72], { gain: .16, len: 3.4 });
pad(FINAL_HIT, [44, 51, 56], 3.2, { gain: .05, cutoff: 1400 });
kick(FINAL_HIT, .5); bass(FINAL_HIT, 44, 2.6, .3);
// the "write to me" hit in the outro lands on its own accent
kick(TL.C.write, .45); clap(TL.C.write, .2);

// ---------------- SFX ----------------
const S = {
  slide: (t) => { const f = lp(800); add(SFX, t, .4, (i, x) => f(noise(), 600 + 2500 * Math.sin(Math.PI * x / .4)) * Math.sin(Math.PI * x / .4), { gain: .35, pan: -.2 }); },
  tick: (t) => add(SFX, t, .03, (i, x) => (Math.sin(2 * Math.PI * 2800 * x) * .6 + noise() * .4) * Math.exp(-x * 160), { gain: .12, pan: .2 }),
  tear: (t) => { const h = hp(1500); let g = 1; add(SFX, t, .5, (i, x) => { if (i % 240 === 0) g = rnd() < .55 ? 1 : .15; return h(noise()) * g * Math.sin(Math.PI * clamp(x / .5)); }, { gain: .45 }); },
  whoosh: (t) => { const f = lp(500); add(SFX, t, .55, (i, x) => { const p = x / .55; return f(noise(), 300 + 3500 * Math.sin(Math.PI * p)) * Math.sin(Math.PI * p) ** 2; }, { gain: .5, send: .2 }); },
  whooshDeep: (t) => { const f = lp(300); add(SFX, t, .8, (i, x) => { const p = x / .8; return f(noise(), 150 + 1800 * p * p) * p * p + Math.sin(2 * Math.PI * (40 + 30 * p) * x) * p * .3; }, { gain: .55, send: .25 }); },
  thud: (t) => { let ph = 0; add(SFX, t, .3, (i, x) => { ph += 2 * Math.PI * (50 + 50 * Math.exp(-x * 20)) / SR; return Math.sin(ph) * Math.exp(-x * 12) + (x < .01 ? noise() * .5 : 0); }, { gain: .5 }); },
  hop: (t, g = .08) => { const f = lp(1800); add(SFX, t, .05, (i, x) => f(noise()) * Math.exp(-x * 80), { gain: g, pan: -.3 }); },
  stick: (t) => { const f = lp(1600); add(SFX, t, .08, (i, x) => f(noise()) * Math.exp(-x * 50) + Math.sin(2 * Math.PI * 420 * x) * Math.exp(-x * 60) * .4, { gain: .3, pan: .3 }); },
  stamp: (t) => { S.thud(t); const f = lp(2500); add(SFX, t, .12, (i, x) => f(noise()) * Math.exp(-x * 40), { gain: .35 }); },
  zapRise: (t) => { add(SFX, t, .38, (i, x) => { const p = x / .38, f = 200 + 2200 * p * p; return ((f * x) % 1 * 2 - 1) * .25 * p + noise() * .3 * p * p; }, { gain: .3, send: .3 }); },
  boom: (t) => { let ph = 0; const f = lp(900); add(SFX, t, 1.4, (i, x) => { ph += 2 * Math.PI * (38 + 40 * Math.exp(-x * 8)) / SR; return Math.sin(ph) * Math.exp(-x * 2.6) + f(noise()) * Math.exp(-x * 9) * .6; }, { gain: .7, send: .4 }); },
  pop: (t) => { let ph = 0; add(SFX, t, .1, (i, x) => { ph += 2 * Math.PI * (300 + 500 * Math.exp(-x * 40)) / SR; return Math.sin(ph) * Math.exp(-x * 35); }, { gain: .3, pan: (rnd() - .5) * .6 }); },
  swish: (t) => { const f = lp(1000); add(SFX, t, .28, (i, x) => { const p = x / .28; return f(noise(), 800 + 5000 * p) * Math.sin(Math.PI * p); }, { gain: .3, pan: .3 }); },
  flick: (t) => { const h = hp(2500); add(SFX, t, .06, (i, x) => h(noise()) * Math.exp(-x * 70), { gain: .25, pan: (rnd() - .5) }); },
  blip: (t) => add(SFX, t, .22, (i, x) => (Math.sin(2 * Math.PI * (x < .08 ? 880 : 1320) * x)) * Math.exp(-((x % .08) * 25)) * (x < .16 ? 1 : 0), { gain: .16, send: .3 }),
  paperLift: (t) => S.whoosh(t),
  tap: (t) => add(SFX, t, .04, (i, x) => (Math.sin(2 * Math.PI * 1500 * x) + noise() * .3) * Math.exp(-x * 120), { gain: .2 }),
  coinUp: (t) => [1318, 1760].forEach((f, k) => add(SFX, t + k * .07, .25, (i, x) => Math.sin(2 * Math.PI * f * x) * Math.exp(-x * 14), { gain: .1, send: .3 })),
  type: (t) => { for (let k = 0; k < 14; k++) S.tick(t + k * .065 + rnd() * .02); },
  chime: (t) => [1046, 1568, 2093].forEach((f, k) => add(SFX, t + k * .09, 1.1, (i, x) => Math.sin(2 * Math.PI * f * x) * Math.exp(-x * 4), { gain: .07, send: .5 })),
  coins: (t) => { for (let k = 0; k < 5; k++) { const f = 2400 + rnd() * 900; add(SFX, t + k * .12, .2, (i, x) => (Math.sin(2 * Math.PI * f * x) + .5 * Math.sin(2 * Math.PI * f * 1.5 * x)) * Math.exp(-x * 22), { gain: .07, pan: (rnd() - .5) * .5, send: .2 }); } },
  flip: (t) => { S.swish(t); S.hop(t + .25, .2); },
  bell: (t) => [0, .32].forEach((d) => [1318, 2637, 3951].forEach((f, k) => add(SFX, t + d, 1.2, (i, x) => Math.sin(2 * Math.PI * f * x) * Math.exp(-x * (3 + k * 2)) / (k + 1), { gain: .14, send: .4 }))),
  scratch: (t) => { const h = hp(2500); let g = 1; add(SFX, t, .35, (i, x) => { if (i % 600 === 0) g = rnd() < .7 ? 1 : .2; return h(noise()) * g * Math.sin(Math.PI * x / .35); }, { gain: .2 }); },
  sonar: (t) => { for (let k = 0; k < 3; k++) add(SFX, t + k * .75, .6, (i, x) => Math.sin(2 * Math.PI * 1150 * x) * Math.exp(-x * 7), { gain: .07, send: .6 }); },
  tock: (t) => add(SFX, t, .08, (i, x) => (Math.sin(2 * Math.PI * 900 * x) + .4 * Math.sin(2 * Math.PI * 1800 * x)) * Math.exp(-x * 60), { gain: .25 }),
};
TL.SFX.forEach(([type, t]) => { if (!S[type]) throw new Error("no sfx " + type); S[type](t); });
// paper people hopping in scene 2 + stickers landing on the box (mirrors index.html PEOPLE)
const P = { t0: 7.4, gap: .9, hop: .38, hops: 9 };
for (let i = 0; i < 4; i++) {
  for (let k = 1; k <= P.hops; k++) S.hop(P.t0 + i * P.gap + k * P.hop, .06);
  S.stick(P.t0 + i * P.gap + P.hops * P.hop + .2);
}

// ---------------- voiceover ----------------
for (const s of TL.SCENES) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", `vo/${s.id}.mp3`, "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"], { maxBuffer: 1 << 28 });
  const v = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const s0 = Math.round((s.vo - START) * SR);
  for (let i = 0; i < v.length && s0 + i < N; i++) VO[s0 + i] += v[i];
}
// normalise voice peaks to -3 dBFS before mixing
{ let pk = 0; for (const x of VO) pk = Math.max(pk, Math.abs(x)); const g = .7 / pk; for (let i = 0; i < N; i++) VO[i] *= g; }

// ---------------- reverb (Schroeder) on the send bus ----------------
function reverb(inp) {
  const out = new Float32Array(N), combs = [1557, 1617, 1491, 1422].map((d) => ({ d, b: new Float32Array(d), i: 0, f: 0 }));
  const aps = [225, 556].map((d) => ({ d, b: new Float32Array(d), i: 0 }));
  for (let n = 0; n < N; n++) {
    let y = 0;
    for (const c of combs) { const o = c.b[c.i]; c.f = o * .8 + c.f * .2; c.b[c.i] = inp[n] + c.f * .78; c.i = (c.i + 1) % c.d; y += o; }
    for (const a of aps) { const o = a.b[a.i]; const w = y + o * .5; a.b[a.i] = w; a.i = (a.i + 1) % a.d; y = o - w * .5; }
    out[n] = y * .25;
  }
  return out;
}
const RV = [reverb(REV[0]), reverb(REV[1])];

// ---------------- ducking + master ----------------
const duck = new Float32Array(N);
{ let e = 0; const att = Math.exp(-1 / (.03 * SR)), rel = Math.exp(-1 / (.35 * SR));
  for (let i = 0; i < N; i++) { const x = Math.abs(VO[i]); e = x > e ? att * e + (1 - att) * x : rel * e + (1 - rel) * x; duck[i] = 1 - .62 * clamp(e / .08); } }
const OUT = buf();
let peak = 0;
{ // balance report: RMS of voice vs ducked music+sfx while the voice is speaking
  let v = 0, m = 0, n = 0;
  for (let i = 0; i < N; i += 4) if (Math.abs(VO[i]) > .02 || duck[i] < .6) {
    v += VO[i] ** 2; const mm = (MUS[0][i] + RV[0][i] * .9) * .55 * duck[i] + SFX[0][i] * .55 * (.55 + .45 * duck[i]); m += mm * mm; n++;
  }
  console.log("voice vs bed (dB):", (10 * Math.log10(v / m)).toFixed(1));
}
for (let i = 0; i < N; i++) {
  const t = START + i / SR, fadeEnd = t > END - 1.4 ? Math.max(0, (END - t) / 1.4) : 1;
  for (let ch = 0; ch < 2; ch++) {
    const m = (MUS[ch][i] + RV[ch][i] * .9) * .55 * duck[i];
    let x = (m + SFX[ch][i] * .55 * (.55 + .45 * duck[i]) + VO[i] * .95) * fadeEnd;
    x = Math.tanh(x * 1.1) / 1.1;    // gentle soft clip
    OUT[ch][i] = x; peak = Math.max(peak, Math.abs(x));
  }
}
const g = .89 / peak;  // -1 dBFS
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) for (let ch = 0; ch < 2; ch++) pcm.writeInt16LE(Math.round(clamp(OUT[ch][i] * g, -1, 1) * 32767), (i * 2 + ch) * 2);
const hdr = Buffer.alloc(44);
hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write("WAVE", 8); hdr.write("fmt ", 12);
hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(SR, 24);
hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write("data", 36); hdr.writeUInt32LE(pcm.length, 40);
fs.writeFileSync("mix.wav", Buffer.concat([hdr, pcm]));
console.log("mix.wav written", DUR, "s, pre-gain peak", peak.toFixed(3));
