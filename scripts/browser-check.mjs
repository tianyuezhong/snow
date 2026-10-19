import { createServer } from "node:http";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
const root = resolve("dist");
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const f = resolve(
      root,
      "." + (path.endsWith("/") ? path + "index.html" : path),
    );
    if (!f.startsWith(root + "/")) throw Error();
    const b = await readFile(f);
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".png": "image/png",
      }[extname(f)] || "application/octet-stream",
    );
    res.end(b);
  } catch {
    res.writeHead(404);
    res.end("missing");
  }
});
await new Promise((r) => server.listen(4173, "127.0.0.1", r));
const chrome = spawn(
  "/usr/bin/chromium",
  [
    "--headless",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--remote-debugging-port=9222",
    "--user-data-dir=" + (await mkdtemp("/tmp/xueji-qa-")),
    "about:blank",
  ],
  { stdio: "ignore" },
);
let ws;
const messages = [];
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try {
      target = (await (await fetch("http://127.0.0.1:9222/json")).json()).find(
        (x) => x.type === "page",
      );
      if (target) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!target) throw Error("Chromium did not start");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let nextId = 0;
  const waiting = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = waiting.get(m.id);
      waiting.delete(m.id);
      m.error ? p.reject(m.error) : p.resolve(m.result);
    } else if (m.method === "Runtime.exceptionThrown")
      messages.push(m.params.exceptionDetails.text);
  };
  const cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      waiting.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const run = async (expression) => {
    const r = await cdp("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const wait = async (expression) => {
    for (let i = 0; i < 100; i++) {
      if (await run(expression)) return;
      await new Promise((r) => setTimeout(r, 80));
    }
    throw Error("Timeout: " + expression);
  };
  const click = async (text) => {
    await run(
      `(()=>{const el=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(text)}));if(!el)throw Error('Button missing: '+${JSON.stringify(text)});el.click()})()`,
    );
    await new Promise((r) => setTimeout(r, 65));
  };
  const fill = async (label, value) => {
    await run(
      `(()=>{const el=[...document.querySelectorAll('label')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(label)}))?.querySelector('input,textarea');if(!el)throw Error('Field missing: '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
    await new Promise((r) => setTimeout(r, 65));
  };
  const note = (s) => {
    console.log("PASS " + s);
  };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp("Page.navigate", { url: "http://127.0.0.1:4173/" });
  await wait(`document.body?.textContent.includes('开始今天的滑雪')`);
  await wait(`navigator.serviceWorker.controller!==null`);
  note("生产页面与 Service Worker 激活");
  // Prepare a real equipment profile through UI.
  await click("◇我的雪季");
  await click("＋ 新增装备");
  await run(`document.querySelector('details').open=true`);
  await fill("装备名称", "QA 装备");
  await fill("雪板型号", "QA Board");
  await fill("前脚角度", "15");
  await wait(`document.body?.textContent.includes('已保存在此设备')`);
  await click("◒今天滑雪");
  await click("开始今天的滑雪");
  await fill("雪场 *", "QA 测试雪场");
  await click("推坡");
  assert.equal(await run(`document.querySelectorAll('.practice').length`), 2);
  await run(
    `document.querySelector('.practice .chips button:nth-child(2)').click()`,
  );
  await fill("最满意的一点", "可以稳定停止");
  await run(
    `(()=>{const el=[...document.querySelectorAll('label')].find(x=>x.textContent.startsWith('当天装备')).querySelector('select');el.value=el.options[1].value;el.dispatchEvent(new Event('change',{bubbles:true}))})()`,
  );
  await wait(`document.body?.textContent.includes('已保存在此设备')`);
  await click("收起");
  await cdp("Page.reload");
  await wait(`document.body?.textContent.includes('继续今天的滑雪')`);
  await click("继续今天的滑雪");
  assert.equal(
    await run(`document.querySelector('input[list=resorts]').value`),
    "QA 测试雪场",
  );
  await click("保存到滑雪日记 ✓");
  await wait(`document.querySelector('.journal')!==null`);
  await wait(`document.body?.textContent.includes('已保存在此设备')`);
  note("草稿刷新恢复、练习匹配、新建日记");
  await click("查看 / 修改");
  await fill("最满意的一点", "修改后的记录");
  await click("保存到滑雪日记 ✓");
  await cdp("Page.reload");
  await wait(`document.body?.textContent.includes('开始今天的滑雪')`);
  await click("▤滑雪日记");
  assert.ok(await run(`document.body?.textContent.includes('修改后的记录')`));
  note("日记编辑与刷新持久化");
  await click("◇我的雪季");
  await run(`document.querySelector('details').open=true`);
  await fill("前脚角度", "21");
  await click("▤滑雪日记");
  assert.ok(
    await run(
      `document.querySelector('.journal details').textContent.includes('15°')`,
    ),
  );
  note("更新装备档案不改变历史快照");
  // Inspect exported payload via actual core backup path (download is browser-specific).
  await click("◇我的雪季");
  await cdp("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: resolve("qa"),
  });
  await click("导出完整 JSON 备份 ↓");
  await new Promise((r) => setTimeout(r, 300));
  const { readdir } = await import("node:fs/promises");
  const file = (await readdir("qa")).find(
    (x) => x.startsWith("雪迹备份-") && x.endsWith(".json"),
  );
  assert.ok(file);
  const backed = JSON.parse(await readFile("qa/" + file, "utf8"));
  assert.equal(backed.data.entries.length, 1);
  note("完整备份实际下载");
  for (const t of ["◒今天滑雪", "▤滑雪日记", "↗技能成长", "◇我的雪季"]) {
    await click(t);
    assert.equal(
      await run(`document.documentElement.scrollWidth>innerWidth`),
      false,
      t + " overflow",
    );
  }
  await click("◒今天滑雪");
  const shot = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile("qa/mobile-home.png", Buffer.from(shot.data, "base64"));
  note("390px 四个页面无横向溢出");
  await cdp("Network.enable");
  await cdp("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await cdp("Page.reload");
  await wait(`document.body?.textContent.includes('开始今天的滑雪')`);
  await click("开始今天的滑雪");
  await fill("雪场 *", "离线雪场");
  await click("保存到滑雪日记 ✓");
  await wait(`document.body?.textContent.includes('已保存在此设备')`);
  await cdp("Page.reload");
  await wait(`document.body?.textContent.includes('开始今天的滑雪')`);
  await click("▤滑雪日记");
  assert.equal(await run(`document.querySelectorAll('.journal').length`), 2);
  note("断网刷新打开、查看练习、离线保存与重新读取");
  await cdp("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
  await run(`window.confirm=()=>true`);
  await click("删除记录");
  await wait(`document.querySelectorAll('.journal').length===1`);
  note("删除日记");
  await click("◇我的雪季");
  const upload = async (path) => {
    const doc = await cdp("DOM.getDocument");
    const node = await cdp("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: "input[type=file]",
    });
    await cdp("DOM.setFileInputFiles", { nodeId: node.nodeId, files: [path] });
    await new Promise((r) => setTimeout(r, 150));
  };
  await writeFile("qa/invalid.json", '{\"format\":\"wrong\"}');
  await upload(resolve("qa/invalid.json"));
  await wait(`document.body?.textContent.includes('导入失败')`);
  assert.equal(
    await run(`document.querySelector('[role=alertdialog]')!==null`),
    false,
  );
  await click("▤滑雪日记");
  assert.equal(await run(`document.querySelectorAll('.journal').length`), 1);
  note("错误 JSON 导入不覆盖原记录");
  await click("◇我的雪季");
  await upload(resolve("qa/" + file));
  await wait(`document.querySelector('[role=alertdialog]')!==null`);
  assert.ok(
    await run(
      `document.querySelector('[role=alertdialog]').textContent.includes('1 篇日记')`,
    ),
  );
  await click("确认替换并恢复");
  await wait(`document.querySelector('[role=alertdialog]')===null`);
  await click("▤滑雪日记");
  assert.equal(await run(`document.querySelectorAll('.journal').length`), 1);
  assert.ok(
    await run(
      `document.querySelector('.journal').textContent.includes('修改后的记录')`,
    ),
  );
  note("备份确认后完整恢复");
  await click("查看 / 修改");
  for (const width of [320, 375, 430]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    assert.equal(
      await run(
        `document.documentElement.scrollWidth>innerWidth||document.querySelector('.modal').scrollWidth>document.querySelector('.modal').clientWidth`,
      ),
      false,
      "modal " + width,
    );
  }
  await click("收起");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await click("◒今天滑雪");
  const desktop = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile("qa/desktop-home.png", Buffer.from(desktop.data, "base64"));
  note("320/375/430px 记录表单无溢出、桌面布局截图");
  assert.equal(messages.length, 0, JSON.stringify(messages));
  console.log("BROWSER QA OK");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  ws?.close();
  chrome.kill("SIGTERM");
  await new Promise((r) => server.close(r));
}
