(function () {
  const VERSION = 1;
  const EVENT_NAME = "CBM_NETWORK_PROBE_EVENT";
  const ENABLE_KEY = "kkmaPmPlusNetworkProbeEnabled";
  const DISABLE_KEY = "kkmaPmPlusNetworkProbeDisabled";
  const MAX_EVENTS = 80;

  const state = {
    events: [],
    injected: false,
    enabledForCurrentPage: false,
    enabledForNextReload: false,
    lateAttach: document.readyState !== "loading",
    lastEventAt: 0,
    errorKind: ""
  };

  state.enabledForNextReload = readEnabledFlag();
  state.enabledForCurrentPage = state.enabledForNextReload;

  window.addEventListener(EVENT_NAME, (event) => {
    pushEvent(event.detail);
  }, true);

  if (state.enabledForCurrentPage) injectPageProbe();

  function injectPageProbe() {
    try {
      const target = document.documentElement || document.head || document.body;
      if (!target) {
        document.addEventListener("DOMContentLoaded", injectPageProbe, { once: true });
        state.lateAttach = true;
        return;
      }

      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("src/network-probe-page.js");
      script.onload = () => script.remove();
      target.appendChild(script);
      state.injected = true;
    } catch (error) {
      state.errorKind = classifyError(error);
    }
  }

  function pushEvent(detail) {
    const clean = sanitizeEvent(detail);
    state.events.push(clean);
    if (state.events.length > MAX_EVENTS) state.events.shift();
    state.lastEventAt = clean.at || Date.now();
  }

  function snapshot() {
    return {
      version: VERSION,
      enabledForCurrentPage: state.enabledForCurrentPage,
      enabledForNextReload: readEnabledFlag(),
      injected: state.injected,
      lateAttach: state.lateAttach,
      eventCount: state.events.length,
      lastEventAt: state.lastEventAt,
      errorKind: state.errorKind,
      events: state.events.slice()
    };
  }

  function diagnosticsText() {
    return JSON.stringify(snapshot(), null, 2);
  }

  async function copyDiagnostics() {
    const text = diagnosticsText();
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      console.info("[KKMA PM+] network diagnostics JSON copied to clipboard");
    } else {
      console.info("[KKMA PM+] network diagnostics JSON", text);
    }
    return text;
  }

  function enableForNextReload() {
    try {
      window.localStorage.setItem(ENABLE_KEY, "1");
      window.localStorage.removeItem(DISABLE_KEY);
    } catch {}
    return {
      enabledForNextReload: readEnabledFlag(),
      reloadRequired: true
    };
  }

  function disableForNextReload() {
    try {
      window.localStorage.removeItem(ENABLE_KEY);
      window.localStorage.setItem(DISABLE_KEY, "1");
    } catch {}
    state.enabledForNextReload = false;
    return {
      enabledForNextReload: false,
      reloadRequired: true
    };
  }

  function clear() {
    state.events = [];
    state.lastEventAt = 0;
    return snapshot();
  }

  function readEnabledFlag() {
    try {
      return window.localStorage.getItem(ENABLE_KEY) === "1" &&
        window.localStorage.getItem(DISABLE_KEY) !== "1";
    } catch {
      return false;
    }
  }

  function sanitizeEvent(detail = {}) {
    return {
      version: VERSION,
      kind: allow(detail.kind, ["websocket", "fetch", "xhr", "probe"], "probe"),
      phase: allow(detail.phase, ["open", "send", "message", "request", "response", "response-payload", "error"], "error"),
      direction: allow(detail.direction, ["in", "out", ""], ""),
      method: allow(detail.method, ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", ""], ""),
      url: sanitizeUrl(detail.url),
      status: clampNumber(detail.status, 0, 999),
      contentTypeKind: allow(detail.contentTypeKind, ["json", "text", "form", "media", "other", ""], ""),
      payload: sanitizePayload(detail.payload),
      errorKind: allow(detail.errorKind, ["type", "security", "other", ""], ""),
      at: clampNumber(detail.at, 0, Number.MAX_SAFE_INTEGER)
    };
  }

  function sanitizeUrl(url = {}) {
    return {
      kind: allow(url.kind, ["same-origin", "chaturbate", "external", "unknown"], "unknown"),
      scheme: allow(url.scheme, ["http", "https", "ws", "wss", ""], ""),
      hostHash: safeHash(url.hostHash),
      pathHash: safeHash(url.pathHash)
    };
  }

  function sanitizePayload(payload = {}) {
    const kinds = Array.isArray(payload.topLevelKeyKinds)
      ? payload.topLevelKeyKinds.map((kind) => allow(kind, ["message", "thread", "user", "room", "event", "id", "secret", "other"], "other"))
      : [];
    return {
      kind: allow(payload.kind, ["empty", "string", "binary", "blob", "form", "object", "other"], "other"),
      size: clampNumber(payload.size, 0, Number.MAX_SAFE_INTEGER),
      truncated: payload.truncated === true,
      topLevelKeyKinds: Array.from(new Set(kinds)).slice(0, 24),
      hasMessageText: payload.hasMessageText === true,
      hasThreadId: payload.hasThreadId === true,
      hasUsername: payload.hasUsername === true,
      hasSecretKey: payload.hasSecretKey === true
    };
  }

  function safeHash(value) {
    const text = String(value || "");
    return /^h[a-z0-9]+$/i.test(text) ? text.slice(0, 32) : "";
  }

  function classifyError(error) {
    const name = String(error?.name || error?.constructor?.name || "error").toLowerCase();
    if (name.includes("type")) return "type";
    if (name.includes("security")) return "security";
    return "other";
  }

  function allow(value, allowed, fallback) {
    const text = String(value || "");
    return allowed.includes(text) ? text : fallback;
  }

  function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  window.CBMultichatNetworkProbeDiagnostics = {
    snapshot,
    diagnosticsText,
    copyDiagnostics,
    enableForNextReload,
    disableForNextReload,
    clear,
    VERSION
  };
})();
