// Synthesises each voiceover line to vo/<id>.mp3 and prints durations.
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Behind an HTTPS proxy (cloud sandbox) the websocket needs an explicit agent.
const agent = process.env.HTTPS_PROXY ? new (await import("https-proxy-agent")).HttpsProxyAgent(process.env.HTTPS_PROXY) : undefined;

const script = JSON.parse(fs.readFileSync("script.json", "utf8"));
const voice = process.env.VOICE || script.voice;
const only = process.argv[2] ? process.argv[2].split(",") : null;   // e.g. node tts.mjs s0,s4,s8,s10
fs.mkdirSync("vo", { recursive: true });

const durations = fs.existsSync("vo/durations.json") ? JSON.parse(fs.readFileSync("vo/durations.json", "utf8")) : {};
for (const line of script.lines) {
  if (only && !only.includes(line.id)) continue;
  const tts = new MsEdgeTTS({ agent });
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
  const dir = fs.mkdtempSync(path.join("vo", "tmp-"));
  const { audioFilePath, metadataFilePath } = await tts.toFile(dir, line.tts, { rate: script.rate });
  const out = path.join("vo", `${line.id}.mp3`);
  fs.copyFileSync(audioFilePath, out);
  if (metadataFilePath) {
    const raw = JSON.parse(fs.readFileSync(metadataFilePath, "utf8"));
    const words = (raw.Metadata || raw).flatMap((m) => (m.Metadata || [m]))
      .filter((m) => m.Type === "WordBoundary")
      .map((m) => ({ t: +(m.Data.Offset / 1e7).toFixed(3), w: m.Data.text.Text }));
    fs.writeFileSync(path.join("vo", `${line.id}.words.json`), JSON.stringify(words));
  }
  fs.rmSync(dir, { recursive: true, force: true });
  tts.close();
  const d = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString().trim();
  durations[line.id] = +(+d).toFixed(3);
  console.log(line.id, durations[line.id]);
}
fs.writeFileSync("vo/durations.json", JSON.stringify(durations, null, 2));
