import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const projectRoot = path.resolve(import.meta.dirname, "..");
const scriptPaths = [
  "src/storage.js",
  "src/diagnostics.js",
  "src/chat-store.js",
  "src/chaturbate-adapter.js",
  "src/emoticons.js",
  "src/compose.js",
  "src/content.js"
].map((file) => path.join(projectRoot, file));
const cssPath = path.join(projectRoot, "styles/content.css");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {}

  const moduleDirs = [
    "/Users/dmitrysilentov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules",
    "/Users/dmitrysilentov/.gstack/repos/gstack/node_modules"
  ];
  for (const moduleDir of moduleDirs) {
    if (!fs.existsSync(path.join(moduleDir, "playwright", "package.json"))) continue;
    const require = createRequire(path.join(moduleDir, "package.json"));
    return require("playwright");
  }
  throw new Error("Playwright is required for content-behavior-smoke");
}

async function injectExtension(page) {
  await page.addStyleTag({ path: cssPath });
  for (const scriptPath of scriptPaths) {
    await page.addScriptTag({ path: scriptPath });
  }
}

async function withBrowser(callback) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true
  });
  try {
    await callback(browser);
  } finally {
    await browser.close();
  }
}

async function loadChaturbateLikePage(browser, body, { width = 1280, height = 800 } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.route("**/*", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: `<!doctype html><html><head><title>Fake room</title></head><body>${body}</body></html>`
  }));
  await page.goto("https://chaturbate.com/archancel/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  return page;
}

async function testUnboundNativePmDoesNotAutoOpen(browser) {
  const page = await loadChaturbateLikePage(browser, `
    <style>
      .ChatTabContents { width: 520px; height: 560px; }
    </style>
    <section class="ChatTabContents TheatermodeChatDivPm">
      <div class="msg-list-fvm message-list">
        <div class="msg-row"><span class="msg-text">You must be a supporter to send this private message.</span></div>
      </div>
      <div class="customInput noScrollbar chat-input-field inputFieldChatPlaceholder theatermodeInputFieldPm" contenteditable="true"></div>
      <button class="Button SendButton SplitMode pm">Send</button>
    </section>
  `);
  await injectExtension(page);
  await page.waitForTimeout(250);

  const titles = await page.locator(".cbm-window-title").allTextContents();
  assert.deepEqual(titles, [], "unbound native PM roots must not auto-open as PM 1/PM 2 windows");
}

async function testExplicitMultichatOpensOnlyUsernameWindow(browser) {
  const page = await loadChaturbateLikePage(browser, `
    <style>
      .user-popover { width: 380px; height: 220px; }
      .user-popover .action, .user-popover a { display: block; min-height: 42px; }
      .ChatTabContents { width: 520px; height: 560px; }
    </style>
    <aside class="user-popover">
      <a href="#">kaepee</a>
      <div class="action">Send private message</div>
      <div class="action">Mention this user</div>
    </aside>
    <section class="ChatTabContents TheatermodeChatDivPm">
      <div class="msg-list-fvm message-list">
        <div class="msg-row">kaepee<span class="msg-text">You must be a supporter to send this private message.</span></div>
      </div>
      <div class="customInput noScrollbar chat-input-field inputFieldChatPlaceholder theatermodeInputFieldPm" contenteditable="true"></div>
      <button class="Button SendButton SplitMode pm">Send</button>
    </section>
  `);
  await injectExtension(page);
  await page.waitForSelector(".cbm-popover-action", { timeout: 1500 });
  await page.click(".cbm-popover-action");
  await page.waitForSelector(".cbm-chat-window", { timeout: 3000 });

  const titles = await page.locator(".cbm-window-title").allTextContents();
  assert.deepEqual(titles, ["kaepee"], "explicit PM+ should open the username chat, not a generic PM window");
}

async function testClosedBoundNativePmDoesNotReopenFromScan(browser) {
  const page = await loadChaturbateLikePage(browser, `
    <style>
      .user-popover { width: 380px; height: 220px; }
      .user-popover .action, .user-popover a { display: block; min-height: 42px; }
      .ChatTabContents { width: 520px; height: 560px; }
    </style>
    <aside class="user-popover">
      <a href="#">kaepee</a>
      <div class="action">Send private message</div>
      <div class="action">Mention this user</div>
    </aside>
    <section class="ChatTabContents TheatermodeChatDivPm">
      <div class="msg-list-fvm message-list">
        <div class="msg-row">kaepee<span class="msg-text">First private message.</span></div>
      </div>
      <div class="customInput noScrollbar chat-input-field inputFieldChatPlaceholder theatermodeInputFieldPm" contenteditable="true"></div>
      <button class="Button SendButton SplitMode pm">Send</button>
    </section>
  `);
  await injectExtension(page);
  await page.waitForSelector(".cbm-popover-action", { timeout: 1500 });
  await page.click(".cbm-popover-action");
  await page.waitForSelector(".cbm-chat-window", { timeout: 3000 });
  await page.click(".cbm-chat-window [data-action='close']");
  await page.waitForFunction(() => document.querySelectorAll(".cbm-chat-window").length === 0);
  await page.evaluate(() => {
    const row = document.createElement("div");
    row.className = "msg-row";
    row.innerHTML = `kaepee<span class="msg-text">Second private message.</span>`;
    document.querySelector(".msg-list-fvm").appendChild(row);
  });
  await page.waitForTimeout(250);

  const renderedCount = await page.locator(".cbm-chat-window").count();
  assert.equal(renderedCount, 0, "closed bound native PM must not reopen itself from DOM scan updates");
}

async function testSendButtonSurvivesHostilePageCss(browser) {
  const page = await loadChaturbateLikePage(browser, `
    <style>
      button { min-width: 84px; padding: 18px 28px; line-height: 3; }
      [data-cbm-chat] { display: none; }
    </style>
    <div data-cbm-chat="beko16" data-cbm-name="Beko16">
      <div data-cbm-message data-cbm-direction="in">hello</div>
    </div>
  `);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("kkmaChaturbatePmPlusState", JSON.stringify({
      enabled: true,
      openChatIds: ["beko16"],
      minimizedChatIds: [],
      unread: {}
    }));
  });
  await injectExtension(page);
  await page.waitForSelector(".cbm-chat-window", { timeout: 3000 });

  const metrics = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        left: box.left,
        right: box.right,
        width: box.width,
        minWidth: style.minWidth,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight
      };
    };
    return {
      window: rect(".cbm-chat-window"),
      compose: rect(".cbm-compose"),
      send: rect(".cbm-send")
    };
  });

  assert(metrics.send.left >= metrics.compose.left, "send button must stay inside compose left edge");
  assert(metrics.send.right <= metrics.window.right, `send button must stay inside window right edge: ${JSON.stringify(metrics)}`);
}

async function testResizeClosesExtraWindows(browser) {
  const page = await loadChaturbateLikePage(browser, `
    <style>[data-cbm-chat] { display: none; }</style>
    <div data-cbm-chat="beko16" data-cbm-name="Beko16"><div data-cbm-message data-cbm-direction="in">one</div></div>
    <div data-cbm-chat="youngbart" data-cbm-name="youngbart"><div data-cbm-message data-cbm-direction="in">two</div></div>
    <div data-cbm-chat="zaka1we" data-cbm-name="Zaka1we"><div data-cbm-message data-cbm-direction="in">three</div></div>
    <div data-cbm-chat="qtarousan1234" data-cbm-name="qtarousan1234"><div data-cbm-message data-cbm-direction="in">four</div></div>
  `, { width: 1280, height: 800 });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("kkmaChaturbatePmPlusState", JSON.stringify({
      enabled: true,
      openChatIds: ["beko16", "youngbart", "zaka1we", "qtarousan1234"],
      minimizedChatIds: [],
      unread: {}
    }));
  });
  await injectExtension(page);
  await page.waitForSelector(".cbm-chat-window", { timeout: 3000 });
  await page.setViewportSize({ width: 760, height: 800 });
  await page.waitForTimeout(250);

  const result = await page.evaluate(() => {
    const windows = Array.from(document.querySelectorAll(".cbm-chat-window"));
    const saved = JSON.parse(localStorage.getItem("kkmaChaturbatePmPlusState") || "{}");
    return {
      renderedCount: windows.length,
      titles: windows.map((node) => node.querySelector(".cbm-window-title")?.textContent || ""),
      savedOpenIds: saved.openChatIds || []
    };
  });

  assert.equal(result.renderedCount, 2, `viewport should close extra windows and leave 2 visible: ${JSON.stringify(result)}`);
  assert.deepEqual(result.savedOpenIds, ["beko16", "youngbart"], "newest/leftmost open ids should be kept after resize trim");
}

await withBrowser(async (browser) => {
  await testUnboundNativePmDoesNotAutoOpen(browser);
  await testExplicitMultichatOpensOnlyUsernameWindow(browser);
  await testClosedBoundNativePmDoesNotReopenFromScan(browser);
  await testSendButtonSurvivesHostilePageCss(browser);
  await testResizeClosesExtraWindows(browser);
});

console.log("content-behavior-smoke ok");
