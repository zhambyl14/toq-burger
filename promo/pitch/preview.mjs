// Renders selected timestamps to preview/<t>.jpg and builds a contact sheet.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { launch } from "./cdp.mjs";

const times = process.argv[2].split(",").map(Number);
const out = process.argv[3] || "preview";
fs.mkdirSync(out, { recursive: true });
const b = await launch({ width: 1920, height: 1080, port: 9334 });
await b.goto(pathToFileURL(path.resolve("index.html")).href);
await b.evaluate("window.ready");
const errs = [];
await b.send("Runtime.enable");
for (const f of fs.readdirSync(out)) fs.rmSync(path.join(out, f));
for (const [i, t] of times.entries()) {
  try { await b.evaluate(`renderAt(${t})`); } catch (e) { errs.push(`${t}: ${e.message}`); }
  await b.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
  fs.writeFileSync(path.join(out, `${String(i).padStart(3, "0")}.jpg`), await b.shot("jpeg", 85));
}
b.close();
if (errs.length) console.log("ERRORS\n" + errs.join("\n"));
if (times.length > 1) {
  const cols = Math.min(4, times.length);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", `${out}/%03d.jpg`, "-vf", `scale=640:-1,tile=${cols}x${Math.ceil(times.length / cols)}`, "-frames:v", "1", `${out}/_sheet.jpg`]);
}
console.log("done", times.length);
