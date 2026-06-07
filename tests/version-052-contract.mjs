import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const projectRoot = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "manifest.json"), "utf8"));
const readme = fs.readFileSync(path.join(projectRoot, "README.md"), "utf8");
const changelog = fs.readFileSync(path.join(projectRoot, "CHANGELOG.md"), "utf8");
const contentSource = fs.readFileSync(path.join(projectRoot, "src", "content.js"), "utf8");

assert.equal(manifest.version, "0.5.2");
assert.equal(manifest.version_name, "0.5.2 Beta");
assert.equal(readme.includes("Current version: `0.5.2 Beta`"), true);
assert.equal(changelog.includes("## 0.5.2 Beta - 2026-06-07"), true);

const earlyScript = manifest.content_scripts[0];
const idleScript = manifest.content_scripts[1];
assert.equal(earlyScript.run_at, "document_start");
assert.deepEqual(earlyScript.js, ["src/network-probe-loader.js"]);
assert.equal(idleScript.run_at, "document_idle");
assert(idleScript.js.indexOf("src/chat-store.js") < idleScript.js.indexOf("src/chaturbate-adapter.js"));
assert(idleScript.js.includes("src/content.js"));

const resources = manifest.web_accessible_resources?.flatMap((entry) => entry.resources) || [];
assert(resources.includes("src/network-probe-page.js"));

const context = {
  window: {
    __CB_MULTICHAT_BOOTED__: false,
    CBMultichatStorage: {
      getState: async () => ({ enabled: true }),
      setState: async () => {}
    },
    CBMultichatAdapter: {
      createAdapter: () => ({
        addEventListener() {},
        start() {}
      })
    },
    CBMultichatEmoticons: {},
    CBMultichatCompose: {},
    CBMultichatDiagnostics: {
      copyDiagnostics() {},
      collect() {},
      diagnosticsText() {}
    },
    CBMultichatNetworkProbeDiagnostics: {
      copyDiagnostics() {},
      diagnosticsText() {},
      enableForNextReload() {},
      disableForNextReload() {},
      clear() {}
    },
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({})
  },
  document: {
    documentElement: {
      appendChild() {},
      setAttribute() {}
    },
    addEventListener() {},
    createElement() {
      const child = {
        style: {},
        innerHTML: "",
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        appendChild() {},
        remove() {},
        setAttribute() {},
        getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 })
      };
      return {
        style: {},
        classList: { toggle() {} },
        querySelector: () => child,
        querySelectorAll: () => [],
        addEventListener() {},
        appendChild() {},
        setAttribute() {},
        getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
        set innerHTML(value) {
          this._innerHTML = value;
        },
        get innerHTML() {
          return this._innerHTML || "";
        }
      };
    },
    querySelectorAll: () => []
  },
  navigator: {},
  console,
  MutationObserver: class MutationObserver {
    observe() {}
  },
  ResizeObserver: class ResizeObserver {
    observe() {}
  },
  requestAnimationFrame: (callback) => callback(),
  setInterval: () => 1,
  clearInterval() {},
  setTimeout,
  clearTimeout
};
context.globalThis = context.window;
context.window.document = context.document;
context.window.navigator = context.navigator;
context.window.MutationObserver = context.MutationObserver;
context.window.ResizeObserver = context.ResizeObserver;
context.window.requestAnimationFrame = context.requestAnimationFrame;
context.window.setInterval = context.setInterval;
context.window.clearInterval = context.clearInterval;
context.window.setTimeout = setTimeout;
context.window.clearTimeout = clearTimeout;

vm.runInNewContext(contentSource, context, { filename: "src/content.js" });
await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(typeof context.window.CBMultichatDebug.copyDiagnostics, "function");
assert.equal(typeof context.window.CBMultichatDebug.copyNetworkDiagnostics, "function");
assert.equal(typeof context.window.CBMultichatDebug.enableNetworkProbeForNextReload, "function");
assert.equal(typeof context.window.CBMultichatDebug.disableNetworkProbeForNextReload, "function");
assert.equal(typeof context.window.CBMultichatDebug.clearNetworkDiagnostics, "function");

console.log("version-052-contract ok");
