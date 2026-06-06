(function () {
  const VERSION = 1;
  const EVENT_NAME = "CBM_NETWORK_PROBE_EVENT";
  const MAX_PAYLOAD_CHARS = 8192;
  const MAX_KEYS = 24;

  if (window.__CB_MULTICHAT_NETWORK_PROBE_PAGE__) return;
  window.__CB_MULTICHAT_NETWORK_PROBE_PAGE__ = true;

  function emit(detail) {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, {
        detail: sanitizeEvent(detail)
      }));
    } catch (error) {
      try {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, {
          detail: {
            version: VERSION,
            kind: "probe",
            phase: "error",
            errorKind: classifyError(error),
            at: Date.now()
          }
        }));
      } catch {}
    }
  }

  function sanitizeEvent(detail = {}) {
    return {
      version: VERSION,
      kind: allow(detail.kind, ["websocket", "fetch", "xhr", "probe"], "probe"),
      phase: allow(detail.phase, ["open", "send", "message", "request", "response", "response-payload", "error"], "error"),
      direction: allow(detail.direction, ["in", "out", ""], ""),
      method: allowMethod(detail.method),
      url: describeUrl(detail.url),
      status: clampNumber(detail.status, 0, 999),
      contentTypeKind: classifyContentType(detail.contentType),
      payload: inspectPayload(detail.payload),
      errorKind: classifyError(detail.error),
      at: clampNumber(detail.at || Date.now(), 0, Number.MAX_SAFE_INTEGER)
    };
  }

  function inspectPayload(payload) {
    const base = {
      kind: classifyPayloadKind(payload),
      size: approximateSize(payload),
      truncated: false,
      topLevelKeyKinds: [],
      hasMessageText: false,
      hasThreadId: false,
      hasUsername: false,
      hasSecretKey: false
    };

    if (payload === undefined || payload === null) return base;

    const text = payloadToText(payload);
    if (text.length > MAX_PAYLOAD_CHARS) {
      base.truncated = true;
      return base;
    }

    const object = parsePayloadObject(payload, text);
    if (!object || typeof object !== "object") return base;

    const keys = Object.keys(object).slice(0, MAX_KEYS);
    base.topLevelKeyKinds = unique(keys.map(classifyKey));
    base.hasMessageText = keys.some((key) => classifyKey(key) === "message" && typeof object[key] === "string" && object[key].length > 0);
    base.hasThreadId = keys.some((key) => classifyKey(key) === "thread");
    base.hasUsername = keys.some((key) => classifyKey(key) === "user");
    base.hasSecretKey = keys.some((key) => classifyKey(key) === "secret");
    return base;
  }

  function parsePayloadObject(payload, text) {
    if (payload && typeof payload === "object" && !isBinaryLike(payload)) return payload;
    if (!text || !/^[\s[{]/.test(text)) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function payloadToText(payload) {
    if (typeof payload === "string") return payload;
    if (typeof URLSearchParams !== "undefined" && payload instanceof URLSearchParams) return payload.toString();
    if (payload && typeof payload === "object" && !isBinaryLike(payload)) {
      try {
        return JSON.stringify(payload);
      } catch {
        return "";
      }
    }
    return "";
  }

  function classifyPayloadKind(payload) {
    if (payload === undefined || payload === null) return "empty";
    if (typeof payload === "string") return "string";
    if (typeof ArrayBuffer !== "undefined" && payload instanceof ArrayBuffer) return "binary";
    if (typeof Blob !== "undefined" && payload instanceof Blob) return "blob";
    if (typeof URLSearchParams !== "undefined" && payload instanceof URLSearchParams) return "form";
    if (typeof FormData !== "undefined" && payload instanceof FormData) return "form";
    if (typeof payload === "object") return "object";
    return "other";
  }

  function isBinaryLike(payload) {
    return (
      (typeof ArrayBuffer !== "undefined" && payload instanceof ArrayBuffer) ||
      (typeof Blob !== "undefined" && payload instanceof Blob) ||
      (typeof FormData !== "undefined" && payload instanceof FormData)
    );
  }

  function approximateSize(payload) {
    if (payload === undefined || payload === null) return 0;
    if (typeof payload === "string") return payload.length;
    if (typeof URLSearchParams !== "undefined" && payload instanceof URLSearchParams) return payload.toString().length;
    if (typeof ArrayBuffer !== "undefined" && payload instanceof ArrayBuffer) return payload.byteLength || 0;
    if (typeof Blob !== "undefined" && payload instanceof Blob) return payload.size || 0;
    try {
      return JSON.stringify(payload).length;
    } catch {
      return 0;
    }
  }

  function describeUrl(value) {
    try {
      const url = new URL(String(value?.url || value || ""), window.location?.href);
      const host = url.host || "";
      const sameOrigin = url.origin === window.location?.origin;
      return {
        kind: sameOrigin ? "same-origin" : (/(^|\.)chaturbate\.com$/i.test(host) ? "chaturbate" : "external"),
        scheme: url.protocol.replace(":", ""),
        hostHash: hashValue(host),
        pathHash: hashValue(url.pathname || "/")
      };
    } catch {
      return {
        kind: "unknown",
        scheme: "",
        hostHash: "",
        pathHash: ""
      };
    }
  }

  function classifyKey(key) {
    const text = String(key || "").toLowerCase();
    if (/csrf|token|auth|cookie|session|password|secret|sig|signature/.test(text)) return "secret";
    if (/message|msg|body|text|content/.test(text)) return "message";
    if (/thread|conversation|pm[_-]?id|chat[_-]?id/.test(text)) return "thread";
    if (/user|username|from|to|member|recipient|sender/.test(text)) return "user";
    if (/room|channel/.test(text)) return "room";
    if (/event|type|action|method|op/.test(text)) return "event";
    if (/id$|^id$/.test(text)) return "id";
    return "other";
  }

  function classifyContentType(value) {
    const text = String(value || "").toLowerCase();
    if (!text) return "";
    if (text.includes("json")) return "json";
    if (text.includes("text") || text.includes("html")) return "text";
    if (text.includes("form")) return "form";
    if (text.includes("image") || text.includes("video") || text.includes("audio")) return "media";
    return "other";
  }

  function classifyError(error) {
    if (!error) return "";
    const name = String(error.name || error.constructor?.name || "error").toLowerCase();
    if (name.includes("type")) return "type";
    if (name.includes("security")) return "security";
    return "other";
  }

  function allowMethod(value) {
    const method = String(value || "").toUpperCase();
    return allow(method, ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", ""], "");
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

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean))).slice(0, MAX_KEYS);
  }

  function hashValue(value) {
    const text = String(value || "");
    if (!text) return "";
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `h${(hash >>> 0).toString(36)}`;
  }

  function installWebSocketProbe() {
    const NativeWebSocket = window.WebSocket;
    if (typeof NativeWebSocket !== "function") return;

    function ProbedWebSocket(url, protocols) {
      const socket = protocols === undefined
        ? new NativeWebSocket(url)
        : new NativeWebSocket(url, protocols);

      emit({ kind: "websocket", phase: "open", url });

      const nativeSend = socket.send;
      if (typeof nativeSend === "function") {
        socket.send = function sendWithProbe(payload) {
          emit({ kind: "websocket", phase: "send", direction: "out", url, payload });
          return nativeSend.apply(this, arguments);
        };
      }

      if (typeof socket.addEventListener === "function") {
        socket.addEventListener("message", (event) => {
          emit({ kind: "websocket", phase: "message", direction: "in", url, payload: event?.data });
        });
      }

      return socket;
    }

    ProbedWebSocket.prototype = NativeWebSocket.prototype;
    ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach((key) => {
      if (key in NativeWebSocket) ProbedWebSocket[key] = NativeWebSocket[key];
    });
    window.WebSocket = ProbedWebSocket;
  }

  function installFetchProbe() {
    const nativeFetch = window.fetch;
    if (typeof nativeFetch !== "function") return;

    window.fetch = function fetchWithProbe(input, init = {}) {
      const url = input?.url || input;
      const method = init.method || input?.method || "GET";
      emit({ kind: "fetch", phase: "request", direction: "out", method, url, payload: init.body });

      return nativeFetch.apply(this, arguments).then((response) => {
        const contentType = response?.headers?.get?.("content-type") || "";
        emit({ kind: "fetch", phase: "response", direction: "in", method, url: response?.url || url, status: response?.status, contentType });
        inspectResponsePayload("fetch", method, response?.url || url, response, contentType);
        return response;
      }, (error) => {
        emit({ kind: "fetch", phase: "error", method, url, error });
        throw error;
      });
    };
  }

  function inspectResponsePayload(kind, method, url, response, contentType) {
    if (!response?.clone || !/json|text|html/i.test(String(contentType || ""))) return;
    const length = Number(response.headers?.get?.("content-length")) || 0;
    if (length > MAX_PAYLOAD_CHARS) {
      emit({ kind, phase: "response-payload", direction: "in", method, url, contentType, payload: "x".repeat(MAX_PAYLOAD_CHARS + 1) });
      return;
    }
    try {
      response.clone().text().then((text) => {
        emit({ kind, phase: "response-payload", direction: "in", method, url, contentType, payload: text });
      }).catch(() => {});
    } catch {}
  }

  function installXhrProbe() {
    const NativeXHR = window.XMLHttpRequest;
    if (typeof NativeXHR !== "function") return;

    function ProbedXHR() {
      const xhr = new NativeXHR();
      let meta = { method: "", url: "" };
      const nativeOpen = xhr.open;
      const nativeSend = xhr.send;

      if (typeof nativeOpen === "function") {
        xhr.open = function openWithProbe(method, url) {
          meta = { method, url };
          return nativeOpen.apply(this, arguments);
        };
      }

      if (typeof nativeSend === "function") {
        xhr.send = function sendWithProbe(payload) {
          emit({ kind: "xhr", phase: "request", direction: "out", method: meta.method, url: meta.url, payload });
          return nativeSend.apply(this, arguments);
        };
      }

      if (typeof xhr.addEventListener === "function") {
        xhr.addEventListener("loadend", () => {
          const contentType = xhr.getResponseHeader?.("content-type") || "";
          emit({ kind: "xhr", phase: "response", direction: "in", method: meta.method, url: meta.url, status: xhr.status, contentType });
          if (/json|text|html/i.test(contentType) && typeof xhr.responseText === "string") {
            emit({ kind: "xhr", phase: "response-payload", direction: "in", method: meta.method, url: meta.url, contentType, payload: xhr.responseText });
          }
        });
      }

      return xhr;
    }

    ProbedXHR.prototype = NativeXHR.prototype;
    window.XMLHttpRequest = ProbedXHR;
  }

  window.CBMultichatNetworkProbePage = {
    version: VERSION,
    sanitizeForTest: inspectPayload,
    describeUrlForTest: describeUrl
  };

  installWebSocketProbe();
  installFetchProbe();
  installXhrProbe();
  emit({ kind: "probe", phase: "open" });
})();
