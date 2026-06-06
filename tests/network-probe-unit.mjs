import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const projectRoot = path.resolve(import.meta.dirname, "..");
const pageProbePath = path.join(projectRoot, "src", "network-probe-page.js");
const loaderPath = path.join(projectRoot, "src", "network-probe-loader.js");

function createPageProbeContext() {
  const events = [];

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url) {
      this.url = url;
      this.listeners = {};
    }

    addEventListener(name, callback) {
      this.listeners[name] = callback;
    }

    send() {
      this.sent = true;
    }
  }

  class FakeXMLHttpRequest {
    constructor() {
      this.listeners = {};
      this.responseText = "";
      this.status = 200;
    }

    open(method, url) {
      this.method = method;
      this.url = url;
    }

    send(body) {
      this.body = body;
    }

    addEventListener(name, callback) {
      this.listeners[name] = callback;
    }

    getResponseHeader(name) {
      if (name.toLowerCase() === "content-type") return "application/json";
      return "";
    }
  }

  const window = {
    WebSocket: FakeWebSocket,
    fetch: (url) => Promise.resolve({
      status: 200,
      headers: { get: () => "application/json" },
      clone() {
        return {
          text: () => Promise.resolve(JSON.stringify({
            message: "secret reply",
            username: "unsaid8935",
            csrfmiddlewaretoken: "csrf-secret"
          }))
        };
      },
      url
    }),
    XMLHttpRequest: FakeXMLHttpRequest,
    location: { href: "https://chaturbate.com/room/?token=secret", origin: "https://chaturbate.com" },
    dispatchEvent(event) {
      events.push(event.detail);
      return true;
    }
  };
  window.window = window;

  const context = {
    window,
    document: {},
    location: window.location,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    Blob: class Blob {},
    URL,
    Promise,
    console,
    setTimeout,
    clearTimeout
  };
  context.globalThis = window;

  return { context, events, window };
}

{
  const { context, events, window } = createPageProbeContext();
  vm.runInNewContext(fs.readFileSync(pageProbePath, "utf8"), context, { filename: pageProbePath });
  vm.runInNewContext("URLSearchParams = undefined", context);

  const payload = window.CBMultichatNetworkProbePage.sanitizeForTest(JSON.stringify({
    message: "come touch my feet private note",
    username: "unsaid8935",
    csrfmiddlewaretoken: "super-secret-csrf",
    url: "https://media-secret.chaturbate.test/private/photo.jpg?token=super-secret"
  }));
  const serializedPayload = JSON.stringify(payload);

  assert.equal(payload.hasMessageText, true);
  assert.equal(payload.hasUsername, true);
  assert.equal(payload.hasSecretKey, true);
  assert(payload.topLevelKeyKinds.includes("message"));
  assert(payload.topLevelKeyKinds.includes("user"));
  assert(payload.topLevelKeyKinds.includes("secret"));
  assert(!serializedPayload.includes("come touch"), "payload shape must not include PM text");
  assert(!serializedPayload.includes("unsaid8935"), "payload shape must not include raw username");
  assert(!serializedPayload.includes("super-secret"), "payload shape must not include tokens");
  assert(!serializedPayload.includes("media-secret"), "payload shape must not include raw URLs");

  const largePayload = window.CBMultichatNetworkProbePage.sanitizeForTest("x".repeat(12000));
  assert.equal(largePayload.truncated, true);
  assert.equal(largePayload.kind, "string");

  const socket = new window.WebSocket("wss://chaturbate.com/ws/private?token=socket-secret");
  socket.send(JSON.stringify({ message: "private socket text", threadId: "thread-secret-1" }));
  socket.listeners.message({ data: JSON.stringify({ username: "unsaid8935", message: "incoming secret" }) });

  const serializedEvents = JSON.stringify(events);
  assert(events.some((event) => event.kind === "websocket" && event.phase === "open"));
  assert(events.some((event) => event.kind === "websocket" && event.direction === "out"));
  assert(events.some((event) => event.kind === "websocket" && event.direction === "in"));
  assert(!serializedEvents.includes("socket-secret"), "events must not include WebSocket query tokens");
  assert(!serializedEvents.includes("private socket text"), "events must not include outbound PM text");
  assert(!serializedEvents.includes("incoming secret"), "events must not include inbound PM text");
  assert(!serializedEvents.includes("thread-secret"), "events must not include raw thread ids");
  assert(!serializedEvents.includes("unsaid8935"), "events must not include raw usernames");
}

{
  const events = [];
  const localStorage = new Map();
  localStorage.set("kkmaPmPlusNetworkProbeEnabled", "1");

  const fakeDocument = {
    documentElement: {
      appendChild(node) {
        events.push({ type: "append", src: node.src });
      }
    },
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        set src(value) {
          this._src = value;
        },
        get src() {
          return this._src;
        },
        remove() {}
      };
    },
    addEventListener() {}
  };

  const context = {
    window: {
      localStorage: {
        getItem: (key) => localStorage.get(key) || null,
        setItem: (key, value) => localStorage.set(key, String(value)),
        removeItem: (key) => localStorage.delete(key)
      },
      addEventListener() {}
    },
    document: fakeDocument,
    chrome: { runtime: { getURL: (file) => `chrome-extension://id/${file}` } },
    CustomEvent: class {},
    navigator: {},
    console
  };
  context.globalThis = context.window;
  context.window.document = fakeDocument;
  context.window.chrome = context.chrome;
  context.window.navigator = context.navigator;

  vm.runInNewContext(fs.readFileSync(loaderPath, "utf8"), context, { filename: loaderPath });

  assert(events.some((event) => event.src.endsWith("/src/network-probe-page.js")));
  assert.equal(context.window.CBMultichatNetworkProbeDiagnostics.snapshot().enabledForCurrentPage, true);

  context.window.CBMultichatNetworkProbeDiagnostics.disableForNextReload();
  assert.equal(localStorage.get("kkmaPmPlusNetworkProbeEnabled"), undefined);
  assert.equal(localStorage.get("kkmaPmPlusNetworkProbeDisabled"), "1");
}

console.log("network-probe-unit ok");
