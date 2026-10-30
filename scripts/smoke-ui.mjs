import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extension = resolve(root, '.output/chrome-mv3');
const profile = resolve(root, '.tmp-chrome');
const shots = resolve(root, '.tmp-screens');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9501;

rmSync(profile, { recursive: true, force: true });
mkdirSync(shots, { recursive: true });
const child = spawn(chrome, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1280,900',
  'about:blank',
], { stdio: 'ignore' });

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

async function browserClient() {
  let version;
  for (let i = 0; i < 40; i += 1) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      break;
    } catch {
      await sleep(200);
    }
  }
  if (!version) throw new Error('debugger unavailable');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((done) => ws.addEventListener('open', done));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) pending.get(message.id)(message);
  });
  return {
    send(method, params = {}) {
      const next = ++id;
      ws.send(JSON.stringify({ id: next, method, params }));
      return new Promise((done) => pending.set(next, done));
    },
    close() {
      ws.close();
    },
  };
}

function pageClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
      return;
    }
    listeners.forEach((listener) => listener(message));
  });
  return new Promise((done) => {
    ws.addEventListener('open', () => {
      done({
        send(method, params = {}) {
          const next = ++id;
          ws.send(JSON.stringify({ id: next, method, params }));
          return new Promise((resolve) => pending.set(next, resolve));
        },
        wait(eventName) {
          return new Promise((resolve) => {
            const listener = (message) => {
              if (message.method === eventName) {
                listeners.splice(listeners.indexOf(listener), 1);
                resolve(message);
              }
            };
            listeners.push(listener);
          });
        },
        close() {
          ws.close();
        },
      });
    });
  });
}

async function inspect(url, name) {
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' }).then((response) => response.json());
  const client = await pageClient(target.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  const loaded = client.wait('Page.loadEventFired');
  await client.send('Page.navigate', { url });
  await Promise.race([loaded, sleep(4000)]);
  await sleep(500);
  const text = await client.send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
  const shot = await client.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(resolve(shots, `${name}.png`), Buffer.from(shot.result.data, 'base64'));
  client.close();
  return text.result.result.value;
}

try {
  const browser = await browserClient();
  const loaded = await browser.send('Extensions.loadUnpacked', { path: extension });
  const extensionId = loaded.result?.id;
  if (!extensionId) throw new Error(`load failed ${JSON.stringify(loaded)}`);
  browser.close();
  await sleep(800);
  const welcome = await inspect(`chrome-extension://${extensionId}/options.html#welcome`, 'welcome');
  const ai = await inspect(`chrome-extension://${extensionId}/options.html#ai`, 'ai');
  const popup = await inspect(`chrome-extension://${extensionId}/sidepanel.html`, 'sidepanel');
  for (const phrase of ['peeklish', 'Read English. Peek when needed.', '智能标注短语', '个人表达库']) {
    if (!welcome.includes(phrase)) throw new Error(`welcome missing ${phrase}\n${welcome}`);
  }
  if (!ai.includes('在本机完成') || ai.includes('API Key')) throw new Error(`built-in engine should hide API fields\n${ai}`);
  if (!popup.includes('Peeklish') || !popup.includes('正在阅读') || !popup.includes('笔记')) throw new Error(`side panel missing controls\n${popup}`);
  if (/演示/.test(welcome + ai + popup)) throw new Error('demo copy is still visible');
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`chrome-extension://${extensionId}/options.html#ai`)}`, {
    method: 'PUT',
  }).then((response) => response.json());
  const client = await pageClient(target.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  const ready = client.wait('Page.loadEventFired');
  await client.send('Page.navigate', { url: `chrome-extension://${extensionId}/options.html#ai` });
  await Promise.race([ready, sleep(4000)]);
  await sleep(400);
  const click = async (label) => {
    const clicked = await client.send('Runtime.evaluate', {
      expression: `(() => { const el = [...document.querySelectorAll('a,button')].find((node) => node.textContent.includes(${JSON.stringify(label)})); if (!el) return 'missing'; el.click(); return 'clicked'; })()`,
      returnByValue: true,
    });
    if (clicked.result.result.value !== 'clicked') throw new Error(`could not click ${label}`);
    await sleep(300);
  };
  const read = async () => {
    const value = await client.send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
    return value.result.result.value;
  };
  await click('自定义 AI');
  const custom = await read();
  if (!custom.includes('接口地址') || !custom.includes('API Key')) throw new Error(`custom AI fields missing\n${custom}`);
  await click('测试连接');
  const afterTest = await read();
  if (!afterTest.includes('请先填写接口地址')) throw new Error(`test connection sent or hid the guard\n${afterTest}`);
  await click('表达库');
  const library = await read();
  if (!library.includes('还没有表达')) throw new Error(`library empty state missing\n${library}`);
  await click('阅读偏好');
  const reading = await read();
  if (!reading.includes('每页自动分析上限')) throw new Error(`reading prefs missing\n${reading}`);
  client.close();
  console.log('SMOKE_OK', extensionId);
} finally {
  child.kill();
}
