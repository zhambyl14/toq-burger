// Bundles voiceover word timings into vo/words.js so the page and the audio mixer share them.
import fs from "node:fs";

const script = JSON.parse(fs.readFileSync("script.json", "utf8"));
const durations = JSON.parse(fs.readFileSync("vo/durations.json", "utf8"));
const words = {};
for (const { id } of script.lines) words[id] = JSON.parse(fs.readFileSync(`vo/${id}.words.json`, "utf8"));
fs.writeFileSync("vo/words.js", `var VO_WORDS = ${JSON.stringify(words)};\nvar VO_DUR = ${JSON.stringify(durations)};\n`);
console.log("ok", Object.keys(words).length);
