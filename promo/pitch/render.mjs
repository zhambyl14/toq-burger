// Deterministic frame render: N headless Edge workers each encode a slice of frames,
// then the slices are concatenated and muxed with mix.wav into the final MP4.
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { launch } from "./cdp.mjs";

const TL = new Function(fs.readFileSync("vo/words.js", "utf8") + fs.readFileSync("timeline.js", "utf8") + "; return TL;")();
const FPS = TL.FPS, TOTAL = Math.round(FPS * TL.DURATION), START = TL.START;
const WORKERS = +(process.env.WORKERS || 4);
const [from, to] = (process.env.RANGE || `0,${TOTAL}`).split(",").map(Number);
const OUT = process.env.OUT || "out/toq-burger-pitch-9x16.mp4";
fs.mkdirSync("out/parts", { recursive: true });

async function worker(w, a, b) {
  const part = `out/parts/p${w}.mp4`;
  const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-vf", "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", part], { stdio: ["pipe", "inherit", "inherit"] });
  const br = await launch({ width: TL.W, height: TL.H, port: 9400 + w });
  await br.goto(pathToFileURL(path.resolve("index.html")).href);
  await br.evaluate("window.ready");
  const t0 = Date.now();
  for (let f = a; f < b; f++) {
    await br.evaluate(`renderAt(${START + f / FPS})`);
    await br.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
    const jpg = await br.shot("jpeg", 95);
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
    if ((f - a) % 300 === 0) console.log(`w${w} frame ${f}/${b} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  br.close();
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  return part;
}

const per = Math.ceil((to - from) / WORKERS), jobs = [];
for (let w = 0; w < WORKERS; w++) {
  const a = from + w * per, b = Math.min(to, a + per);
  if (a < b) jobs.push(worker(w, a, b));
}
const parts = await Promise.all(jobs);
fs.writeFileSync("out/parts/list.txt", parts.map((p) => `file '${path.resolve(p).replace(/\\/g, "/")}'`).join("\n"));
const ss = (from / FPS).toFixed(4), len = ((to - from) / FPS).toFixed(4);
execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", "out/parts/list.txt", "-ss", ss, "-t", len, "-i", "mix.wav",
  "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", OUT], { stdio: "inherit" });
console.log("wrote", OUT);
