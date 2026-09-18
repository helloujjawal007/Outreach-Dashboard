const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

async function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function getWsUrl(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const list = JSON.parse(data);
          const page = list.find(t => t.type === 'page') || list[0];
          resolve(page.webSocketDebuggerUrl);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.callbacks = new Map();
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.callbacks.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }
}

async function main() {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const port = 9444;
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${port}`,
    '--window-size=1560,950',
    'about:blank'
  ]);

  await sleep(1500);
  try {
    const wsUrl = await getWsUrl(port);
    const ws = new WebSocket(wsUrl);
    await new Promise((res) => { ws.onopen = res; });
    const cdp = new CDP(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log('Navigating to http://localhost:5173...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173' });
    await sleep(3000);

    // Click on AI Growth Copilot button in sidebar
    console.log('Clicking on AI Growth Copilot...');
    const clickNav = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const copilotBtn = buttons.find(b => (b.innerText || '').includes('AI Growth Copilot'));
          if (copilotBtn) {
            copilotBtn.click();
            return 'clicked AI Growth Copilot button';
          }
          return 'AI Growth Copilot button not found';
        })()
      `
    });
    console.log('Nav result:', clickNav.result.value);
    await sleep(3000);

    // Take initial screenshot of AI Copilot Page
    console.log('Capturing initial AI Copilot page screenshot...');
    const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const outPath1 = '/Users/ujjawal/.gemini/antigravity-ide/brain/98518f4b-e9ba-4e65-9d4f-56e606050588/ai_copilot_page.png';
    fs.writeFileSync(outPath1, Buffer.from(shot1.data, 'base64'));
    console.log('Saved initial screenshot to:', outPath1);

    // Click on "Scan & Auto-Detect Forms" on the right half suggestion card
    console.log('Clicking on Scan & Auto-Detect Forms on right half...');
    const clickSuggestAction = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const formBtn = buttons.find(b => (b.innerText || '').includes('Scan & Auto-Detect Forms'));
          if (formBtn) {
            formBtn.click();
            return 'clicked Scan & Auto-Detect Forms button';
          }
          return 'Scan & Auto-Detect Forms button not found';
        })()
      `
    });
    console.log('Suggestion action click result:', clickSuggestAction.result.value);
    await sleep(12000);

    // Take screenshot after executing form crawl
    console.log('Capturing post-form-crawl AI Copilot screenshot...');
    const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const outPath2 = '/Users/ujjawal/.gemini/antigravity-ide/brain/98518f4b-e9ba-4e65-9d4f-56e606050588/ai_copilot_form_crawl.png';
    fs.writeFileSync(outPath2, Buffer.from(shot2.data, 'base64'));
    console.log('Saved form crawl screenshot to:', outPath2);

    ws.close();
  } finally {
    chromeProc.kill();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
