// Minimal headless Edge driver over the Chrome DevTools Protocol (no dependencies).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

export async function launch({ width, height, scale = 1, port = 9333 }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "edge-cdp-"));
  const proc = spawn(EDGE, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--hide-scrollbars", "--force-color-profile=srgb",
    "--disable-features=msEdgeSidebarV2", "--mute-audio", "about:blank",
  ], { stdio: "ignore" });

  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === "page");
    } catch {}
  }
  if (!target) throw new Error("Edge did not start");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method) listeners.forEach((f) => f(msg));
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const waitEvent = (name) => new Promise((r) => {
    const f = (m) => { if (m.method === name) { listeners.splice(listeners.indexOf(f), 1); r(m.params); } };
    listeners.push(f);
  });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const goto = async (url) => {
    const loaded = waitEvent("Page.loadEventFired");
    await send("Page.navigate", { url });
    await loaded;
  };
  const shot = async (format = "png", quality) =>
    Buffer.from((await send("Page.captureScreenshot", { format, quality, optimizeForSpeed: true })).data, "base64");
  const close = () => { try { ws.close(); } catch {} proc.kill(); };
  return { send, evaluate, goto, shot, close };
}
