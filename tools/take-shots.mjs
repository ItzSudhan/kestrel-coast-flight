// Takes the entry's screenshots with headless Chrome over the DevTools protocol (Node 22, no
// packages): serves game/, opens each ?shot= scene from shots.json in a 1280x800 window, waits
// for window.__shotReady, saves a JPEG under 256 KiB into screenshots/, and fails on any console
// error. `--play` instead loads the game itself, starts a sortie with real key presses, flies a
// few seconds and saves out/play-check.jpg, again failing on console errors.
// Run: node tools/take-shots.mjs [--play] [--only name]
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const play = args.includes('--play');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8123;
const DEBUG_PORT = 9333;
/** Each shot stays under 240 KiB so four of them, base64'd into dossier.json beside 160 KiB of source text, keep it under the 1.5 MiB cap. */
const MAX_BYTES = 240 * 1024;
/** Window size: 1280x800 for the screenshots; `--size WxH` checks the HUD at other shapes in --play. */
const [WIDTH, HEIGHT] = (args.includes('--size') ? args[args.indexOf('--size') + 1] : '1280x800').split('x').map(Number);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(fn, timeout, label) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      // not ready yet
    }
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${label}`);
}

const server = spawn(process.execPath, [join(root, 'serve.ts'), '--port', String(PORT)], { stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'kestrel-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, `--window-size=${WIDTH},${HEIGHT}`,
  '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
], { stdio: 'ignore' });

let failed = false;
try {
  await waitFor(() => fetch(`http://127.0.0.1:${PORT}/index.html`).then((r) => r.ok), 10000, 'server');
  const target = await waitFor(() => fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json()), 15000, 'chrome');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
      return;
    }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text);
    if (data.method === 'Runtime.consoleAPICalled' && (data.params.type === 'error' || data.params.type === 'warning')) {
      const textValue = data.params.args.map((a) => a.value ?? a.description).join(' ');
      if (data.params.type === 'error') errors.push(textValue);
      else console.log(`  console warning: ${textValue}`);
    }
    if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error') errors.push(`${data.params.entry.text} ${data.params.entry.url ?? ''}`);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;

  const capture = async (file) => {
    let quality = 90;
    let bytes;
    for (;;) {
      const shotData = await send('Page.captureScreenshot', { format: 'jpeg', quality, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 } });
      bytes = Buffer.from(shotData.data, 'base64');
      if (bytes.length <= MAX_BYTES || quality <= 40) break;
      quality -= 4;
    }
    writeFileSync(file, bytes);
    console.log(`saved ${file} (${Math.round(bytes.length / 1024)} KiB, quality ${quality})`);
  };

  if (play) {
    mkdirSync(join(root, 'out'), { recursive: true });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?seed=3` });
    const loaded = await waitFor(() => evaluate('document.getElementById("status").textContent.startsWith("Kestrel Coast") && performance.now()'), 30000, 'game start');
    console.log(`  game ready ${Math.round(loaded)} ms after navigation`);
    await sleep(500);
    const key = async (code, key, hold = 0) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 13 });
      if (hold) await sleep(hold);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key });
    };
    await key(args.includes('--chase') ? 'Digit1' : 'Digit2', args.includes('--chase') ? '1' : '2');
    await sleep(500);
    await key('Enter', 'Enter');
    await sleep(500);
    await key('ShiftLeft', 'Shift', 2500);
    await sleep(6000);
    await key('KeyS', 's', 1200);
    await sleep(3000);
    await key('KeyG', 'g');
    if (args.includes('--crash')) {
      await key('KeyW', 'w', 9000);
      await sleep(5000);
    } else if (args.includes('--chase')) {
      await key('KeyD', 'd', 700);
      await sleep(2500);
      if (args.includes('--map')) await key('KeyM', 'm');
      if (args.includes('--help')) await key('KeyH', 'h');
      await sleep(300);
    } else {
      await key('KeyC', 'c');
      await sleep(1500);
    }
    const fps = await evaluate('new Promise((resolve) => { let n = 0; const t0 = performance.now(); const tick = () => { n += 1; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else resolve(Math.round(n / 2)); }; requestAnimationFrame(tick); })');
    console.log(`  frames per second (headless): ${fps}`);
    const state = await evaluate('document.getElementById("status").textContent');
    console.log(`  status line: ${state}`);
    await capture(join(root, 'out', 'play-check.jpg'));
  } else {
    // `--list file.json --out dir` renders other scenes (the board, a crash) for a look, leaving screenshots/ alone.
    const listFile = args.includes('--list') ? args[args.indexOf('--list') + 1] : join(root, 'shots.json');
    const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(root, 'screenshots');
    const shots = JSON.parse(readFileSync(listFile, 'utf8'));
    mkdirSync(outDir, { recursive: true });
    for (const s of shots) {
      if (only && !s.name.includes(only)) continue;
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html${s.query}` });
      await waitFor(() => evaluate('window.__shotReady === true'), 120000, `${s.name} ready`);
      await sleep(300);
      await capture(join(outDir, s.name));
    }
  }
  if (errors.length) {
    failed = true;
    console.log('console errors:');
    for (const e of errors) console.log(`  ${e}`);
  } else console.log('no console errors');
  ws.close();
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  chrome.kill();
  server.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
