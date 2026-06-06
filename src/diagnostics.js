(function () {
  const VERSION = 1;
  const MAX_CANDIDATES = 20;
  const MAX_CONTROLS = 12;
  const MAX_INPUTS = 8;
  const MAX_CLASSES = 8;
  const MAX_EMOTICON_POPUPS = 8;
  const MAX_EMOTICON_ITEMS = 12;
  const MAX_MEDIA_CANDIDATES = 12;
  const MAX_MEDIA_IMAGES = 6;

  const CANDIDATE_SELECTORS = [
    "[class*='private' i]",
    "[class*='message' i]",
    "[class*='pm' i]",
    "[id*='private' i]",
    "[id*='message' i]",
    "[id*='pm' i]",
    "[data-testid*='private' i]",
    "[data-testid*='message' i]",
    "[data-testid*='pm' i]",
    "[role='dialog']"
  ];
  const EMOTICON_POPUP_SELECTORS = [
    "[class*='emoticon' i]",
    "[class*='emoji' i]",
    "[class*='autocomplete' i]",
    "[class*='suggest' i]",
    "[role='listbox']",
    "[role='menu']"
  ];
  const MEDIA_SELECTORS = [
    "img",
    "[class*='photo' i]",
    "[class*='image' i]",
    "[class*='media' i]",
    "[class*='attachment' i]"
  ];

  function collect({ root = document, maxCandidates = MAX_CANDIDATES } = {}) {
    const candidateNodes = findCandidates(root).slice(0, maxCandidates);
    const candidates = candidateNodes.map((node, index) => describeCandidate(node, index));
    const mediaCandidates = findPmMediaCandidates(candidateNodes)
      .slice(0, MAX_MEDIA_CANDIDATES)
      .map((node, index) => describePmMediaCandidate(node, index));
    const emoticonPopups = findEmoticonPopups(root)
      .slice(0, MAX_EMOTICON_POPUPS)
      .map((node, index) => describeEmoticonPopup(node, index));

    return {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      location: describeLocation(root),
      selectors: CANDIDATE_SELECTORS,
      emoticonPopupSelectors: EMOTICON_POPUP_SELECTORS,
      mediaSelectors: MEDIA_SELECTORS,
      mediaCandidates,
      emoticonPopups,
      networkProbe: describeNetworkProbe(),
      candidates
    };
  }

  async function copyDiagnostics(options) {
    const serialized = diagnosticsText(options);

    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(serialized);
      console.info("[KKMA PM+] diagnostics JSON copied to clipboard");
    } else {
      console.info("[KKMA PM+] diagnostics JSON", serialized);
    }

    return serialized;
  }

  function diagnosticsText(options) {
    return JSON.stringify(collect(options), null, 2);
  }

  function findCandidates(root) {
    const seen = new Set();
    const candidates = [];

    const addCandidate = (node) => {
      if (!node || seen.has(node)) return;
      seen.add(node);
      if (!looksUseful(node)) return;
      candidates.push(node);
    };

    CANDIDATE_SELECTORS.forEach((selector) => {
      Array.from(root.querySelectorAll?.(selector) || []).forEach(addCandidate);
    });

    Array.from(root.querySelectorAll?.("a, button, [role='button'], div, span") || [])
      .filter((node) => classifyControl(node) !== "unknown")
      .map((node) => nearestUsefulContainer(node))
      .forEach(addCandidate);

    return candidates.sort((a, b) => area(b) - area(a));
  }

  function findEmoticonPopups(root) {
    const seen = new Set();
    const popups = [];
    EMOTICON_POPUP_SELECTORS.forEach((selector) => {
      Array.from(root.querySelectorAll?.(selector) || []).forEach((node) => {
        if (!node || seen.has(node)) return;
        seen.add(node);
        const rect = safeRect(node);
        if (rect.width < 40 || rect.height < 20) return;
        if (rect.width > 900 || rect.height > 700) return;
        popups.push(node);
      });
    });
    return popups.sort((a, b) => area(b) - area(a));
  }

  function findPmMediaCandidates(candidateNodes) {
    const seen = new Set();
    const rows = [];

    candidateNodes.forEach((root) => {
      const mediaNodes = [];
      if (isMediaNode(root)) mediaNodes.push(root);
      MEDIA_SELECTORS.forEach((selector) => {
        Array.from(root.querySelectorAll?.(selector) || []).forEach((node) => mediaNodes.push(node));
      });

      mediaNodes.forEach((node) => {
        if (!isMediaNode(node)) return;
        const row = nearestMediaContainer(node, root);
        if (!row || seen.has(row)) return;
        seen.add(row);
        if (!hasVisibleMediaMarker(row)) return;
        rows.push(row);
      });
    });

    return rows.sort((a, b) => area(b) - area(a));
  }

  function nearestUsefulContainer(node) {
    let current = node;
    let best = node;
    for (let depth = 0; current && depth < 8; depth += 1) {
      const rect = safeRect(current);
      if (rect.width >= 180 && rect.height >= 80) best = current;
      current = current.parentElement;
    }
    return best;
  }

  function describeCandidate(node, index) {
    const rect = safeRect(node);
    const controls = Array.from(node.querySelectorAll?.("a, button, [role='button'], div, span") || [])
      .filter((control) => classifyControl(control) !== "unknown")
      .slice(0, MAX_CONTROLS)
      .map(describeControl);

    const inputs = Array.from(node.querySelectorAll?.("textarea, input, [contenteditable='true']") || [])
      .slice(0, MAX_INPUTS)
      .map(describeInput);

    const messageLikeCount = Array.from(
      node.querySelectorAll?.("[class*='message' i], [class*='msg' i], [data-testid*='message' i], li, p") || []
    ).length;

    return {
      index,
      tag: tagName(node),
      role: safeAttr(node, "role"),
      idHash: hashValue(node.id || safeAttr(node, "id")),
      classTokens: classTokens(node),
      dataTestIdHash: hashValue(safeAttr(node, "data-testid")),
      ariaLabelKind: classifyAria(safeAttr(node, "aria-label")),
      rect,
      childElementCount: Number(node.childElementCount) || 0,
      textLength: textLength(node),
      controls,
      inputs,
      messageLikeCount
    };
  }

  function describeControl(node) {
    return {
      tag: tagName(node),
      role: safeAttr(node, "role"),
      type: safeAttr(node, "type"),
      classTokens: classTokens(node),
      textKind: classifyControl(node),
      hrefKind: classifyHref(safeAttr(node, "href"))
    };
  }

  function describeInput(node) {
    return {
      tag: tagName(node),
      role: safeAttr(node, "role"),
      type: safeAttr(node, "type"),
      classTokens: classTokens(node),
      contentEditable: node.isContentEditable === true || safeAttr(node, "contenteditable") === "true"
    };
  }

  function describeEmoticonPopup(node, index) {
    const items = Array.from(node.querySelectorAll?.(
      "[role='option'], [role='menuitem'], button, a, li, .modalItem, .tag-text, [class*='emoticon' i], [class*='emoji' i], [class*='autocomplete' i], [class*='suggest' i]"
    ) || [])
      .slice(0, MAX_EMOTICON_ITEMS)
      .map(describeEmoticonItem);

    return {
      index,
      tag: tagName(node),
      role: safeAttr(node, "role"),
      classTokens: classTokens(node),
      rect: safeRect(node),
      childElementCount: Number(node.childElementCount) || 0,
      itemCount: items.length,
      items
    };
  }

  function describeEmoticonItem(node) {
    const image = node.querySelector?.("img");
    return {
      tag: tagName(node),
      role: safeAttr(node, "role"),
      classTokens: classTokens(node),
      hasImage: !!image,
      imageHostHash: hashValue(image?.src ? safeUrlHost(image.src) : "")
    };
  }

  function describePmMediaCandidate(node, index) {
    const images = Array.from(node.querySelectorAll?.("img") || [])
      .filter((image) => tagName(image) === "img")
      .slice(0, MAX_MEDIA_IMAGES);
    const controls = Array.from(node.querySelectorAll?.("a, button, [role='button'], div, span") || [])
      .filter((control) => classifyMediaControl(control) !== "unknown")
      .slice(0, MAX_CONTROLS)
      .map(describeMediaControl);
    const imageHostHashes = uniqueValues(
      images
        .map((image) => hashValue(safeUrlHost(mediaUrlHint(image))))
        .filter(Boolean)
    );

    return {
      index,
      tag: tagName(node),
      role: safeAttr(node, "role"),
      classTokens: classTokens(node),
      rect: safeRect(node),
      statusKind: classifyMediaStatus(node),
      mediaLikeCount: countMediaMarkers(node),
      imageCount: images.length,
      imageHostHashes,
      images: images.map(describeMediaImage),
      controls
    };
  }

  function describeMediaImage(node) {
    return {
      tag: tagName(node),
      role: safeAttr(node, "role"),
      classTokens: classTokens(node),
      rect: safeRect(node),
      hasImage: true,
      imageHostHash: hashValue(safeUrlHost(mediaUrlHint(node)))
    };
  }

  function describeMediaControl(node) {
    return {
      tag: tagName(node),
      role: safeAttr(node, "role"),
      type: safeAttr(node, "type"),
      classTokens: classTokens(node),
      textKind: classifyMediaControl(node),
      hrefKind: classifyHref(safeAttr(node, "href"))
    };
  }

  function describeLocation(root) {
    const location = root.location || root.defaultView?.location || document.location;
    return {
      hostHash: hashValue(location?.host),
      pathnameKind: classifyPathname(location?.pathname)
    };
  }

  function looksUseful(node) {
    const rect = safeRect(node);
    if (rect.width < 80 || rect.height < 30) return false;
    if (textLength(node) > 8000) return false;
    return true;
  }

  function nearestMediaContainer(node, boundary) {
    let current = node;
    const skipSelf = isMediaLeaf(node);

    for (let depth = 0; current && depth < 6; depth += 1) {
      if (current === boundary) break;
      if (!(current === node && skipSelf) && isMediaContainer(current)) return current;
      current = current.parentElement;
    }

    return node;
  }

  function isMediaLeaf(node) {
    const tag = tagName(node);
    return tag === "img" || tag === "button" || tag === "a" || safeAttr(node, "role") === "button";
  }

  function isMediaContainer(node) {
    const marker = `${tagName(node)} ${safeAttr(node, "class")} ${safeAttr(node, "id")} ${safeAttr(node, "data-testid")}`;
    if (/\b(li|p|article)\b/i.test(tagName(node))) return true;
    return /message|msg|private|pm|photo|image|media|attachment/i.test(marker);
  }

  function hasVisibleMediaMarker(node) {
    if (isMediaNode(node)) return true;
    return Array.from(node.querySelectorAll?.(MEDIA_SELECTORS.join(",")) || []).some(isMediaNode);
  }

  function isMediaNode(node) {
    if (!node) return false;
    if (tagName(node) === "img") return true;
    const marker = `${safeAttr(node, "class")} ${safeAttr(node, "id")} ${safeAttr(node, "data-testid")} ${safeAttr(node, "aria-label")}`;
    return /photo|image|media|attachment/i.test(marker);
  }

  function countMediaMarkers(node) {
    return Array.from(node.querySelectorAll?.(MEDIA_SELECTORS.join(",")) || [])
      .filter(isMediaNode)
      .length;
  }

  function safeRect(node) {
    const rect = node.getBoundingClientRect?.() || {};
    return {
      width: Math.round(Number(rect.width) || 0),
      height: Math.round(Number(rect.height) || 0),
      top: Math.round(Number(rect.top) || 0),
      left: Math.round(Number(rect.left) || 0)
    };
  }

  function area(node) {
    const rect = safeRect(node);
    return rect.width * rect.height;
  }

  function safeAttr(node, name) {
    const value = node.getAttribute?.(name);
    if (value === null || value === undefined) return "";
    return String(value).slice(0, 160);
  }

  function classTokens(node) {
    return String(node.className || "")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => token.length <= 60)
      .slice(0, MAX_CLASSES);
  }

  function tagName(node) {
    return String(node.tagName || "").toLowerCase();
  }

  function textLength(node) {
    return String(node.textContent || "").replace(/\s+/g, " ").trim().length;
  }

  function classifyControl(node) {
    const text = String(node.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (text === "send private message") return "send-private-message";
    if (text === "send direct message") return "send-direct-message";
    if (text === "mention this user") return "mention-user";
    if (text === "multichat" || text === "pm+") return "cb-multichat";
    if (/^send$/.test(text)) return "send";
    if (/open\s+photo|view\s+photo|show\s+photo|open\s+image|view\s+image/.test(text)) return "open-photo";
    if (/close|закрыть/.test(text)) return "close";
    if (/minimize|свернуть/.test(text)) return "minimize";
    return "unknown";
  }

  function classifyMediaControl(node) {
    const text = String(node.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (/open\s+photo|view\s+photo|show\s+photo|open\s+image|view\s+image/.test(text)) return "open-photo";
    if (/close|закрыть/.test(text)) return "close";
    if (/download|save|copy/.test(text)) return "download-or-copy";
    return "unknown";
  }

  function classifyMediaStatus(node) {
    const text = `${node.textContent || ""} ${safeAttr(node, "class")} ${safeAttr(node, "aria-label")}`.toLowerCase();
    if (/unopened|not\s+opened|unread|new\s+photo/.test(text)) return "unopened";
    if (/opened|viewed|read/.test(text)) return "opened";
    return "unknown";
  }

  function classifyAria(value) {
    const text = String(value || "").toLowerCase();
    if (!text) return "";
    if (/private/.test(text)) return "private";
    if (/message|chat/.test(text)) return "message";
    if (/dialog/.test(text)) return "dialog";
    return "other";
  }

  function classifyHref(value) {
    if (!value) return "";
    if (/^javascript:/i.test(value)) return "javascript";
    if (/^#/.test(value)) return "same-page";
    if (/^https?:/i.test(value)) return "absolute-url";
    return "relative-or-other";
  }

  function classifyPathname(pathname) {
    const path = String(pathname || "").toLowerCase();
    if (!path || path === "/") return "root";
    if (/broadcast|broadcaster/.test(path)) return "broadcast";
    if (/room|chat/.test(path)) return "room-or-chat";
    return "other";
  }

  function safeUrlHost(value) {
    try {
      return new URL(value, document.location?.href).host;
    } catch {
      return "";
    }
  }

  function mediaUrlHint(node) {
    return node?.currentSrc || node?.src || safeAttr(node, "src") || safeAttr(node, "data-src") || "";
  }

  function uniqueValues(values) {
    return Array.from(new Set(values));
  }

  function describeNetworkProbe() {
    const snapshot = window.CBMultichatNetworkProbeDiagnostics?.snapshot?.();
    if (!snapshot) return null;

    return {
      version: 1,
      enabledForCurrentPage: snapshot.enabledForCurrentPage === true,
      enabledForNextReload: snapshot.enabledForNextReload === true,
      injected: snapshot.injected === true,
      lateAttach: snapshot.lateAttach === true,
      eventCount: clampNumber(snapshot.eventCount, 0, 10000),
      lastEventAt: clampNumber(snapshot.lastEventAt, 0, Number.MAX_SAFE_INTEGER),
      errorKind: allow(snapshot.errorKind, ["type", "security", "other", ""], ""),
      events: Array.isArray(snapshot.events)
        ? snapshot.events.slice(0, 80).map(sanitizeNetworkEvent)
        : []
    };
  }

  function sanitizeNetworkEvent(event = {}) {
    return {
      kind: allow(event.kind, ["websocket", "fetch", "xhr", "probe"], "probe"),
      phase: allow(event.phase, ["open", "send", "message", "request", "response", "response-payload", "error"], "error"),
      direction: allow(event.direction, ["in", "out", ""], ""),
      method: allow(event.method, ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", ""], ""),
      url: sanitizeNetworkUrl(event.url),
      status: clampNumber(event.status, 0, 999),
      contentTypeKind: allow(event.contentTypeKind, ["json", "text", "form", "media", "other", ""], ""),
      payload: sanitizeNetworkPayload(event.payload),
      errorKind: allow(event.errorKind, ["type", "security", "other", ""], ""),
      at: clampNumber(event.at, 0, Number.MAX_SAFE_INTEGER)
    };
  }

  function sanitizeNetworkUrl(url = {}) {
    return {
      kind: allow(url.kind, ["same-origin", "chaturbate", "external", "unknown"], "unknown"),
      scheme: allow(url.scheme, ["http", "https", "ws", "wss", ""], ""),
      hostHash: safeHash(url.hostHash),
      pathHash: safeHash(url.pathHash)
    };
  }

  function sanitizeNetworkPayload(payload = {}) {
    const keyKinds = Array.isArray(payload.topLevelKeyKinds)
      ? payload.topLevelKeyKinds.map((kind) => allow(kind, ["message", "thread", "user", "room", "event", "id", "secret", "other"], "other"))
      : [];
    return {
      kind: allow(payload.kind, ["empty", "string", "binary", "blob", "form", "object", "other"], "other"),
      size: clampNumber(payload.size, 0, Number.MAX_SAFE_INTEGER),
      truncated: payload.truncated === true,
      topLevelKeyKinds: uniqueValues(keyKinds).slice(0, 24),
      hasMessageText: payload.hasMessageText === true,
      hasThreadId: payload.hasThreadId === true,
      hasUsername: payload.hasUsername === true,
      hasSecretKey: payload.hasSecretKey === true
    };
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

  function safeHash(value) {
    const text = String(value || "");
    return /^h[a-z0-9]+$/i.test(text) ? text.slice(0, 32) : "";
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

  window.CBMultichatDiagnostics = {
    collect,
    copyDiagnostics,
    diagnosticsText,
    VERSION
  };
})();
