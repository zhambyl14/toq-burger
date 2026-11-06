// Captures phone-sized screenshots of the public customer site into shots/.
import fs from "node:fs";
import { launch } from "./cdp.mjs";

const BASE = "https://toq-burger.tarazblt12005.workers.dev";
const pages = (process.argv[2] || "/").split(",");
const lang = process.argv[3] || "ru";
const height = +(process.argv[4] || 844);
fs.mkdirSync("shots", { recursive: true });

const b = await launch({ width: 390, height, scale: 2 });
await b.send("Emulation.setUserAgentOverride", {
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
});
await b.send("Emulation.setDeviceMetricsOverride", { width: 390, height, deviceScaleFactor: 2, mobile: true });
await b.send("Network.setCookie", { name: "tb_lang", value: lang, url: BASE });
for (const p of pages) {
  await b.goto(BASE + p);
  await new Promise((r) => setTimeout(r, 3500));
  const name = (p === "/" ? "home" : p.replace(/\//g, "_").replace(/^_/, "")) + `-${lang}`;
  fs.writeFileSync(`shots/${name}.png`, await b.shot());
  const text = await b.evaluate("document.body.innerText.slice(0, 400)");
  const imgs = await b.evaluate("[...new Set([...document.images].map(i => i.currentSrc))].slice(0, 30)");
  console.log("==", p, "\n", text.replace(/\n+/g, " | "), "\n", imgs.join("\n "));
}
b.close();
