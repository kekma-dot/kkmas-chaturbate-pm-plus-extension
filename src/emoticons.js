(function () {
  const MAX_QUERY_LENGTH = 40;
  const QUERY_RE = /(^|\s)(:[a-zA-Z0-9_-]{1,40})$/;

  function findActiveQuery(value, caret) {
    const text = String(value || "");
    const cursor = Number.isFinite(caret) ? Math.max(0, Math.min(caret, text.length)) : text.length;
    const beforeCaret = text.slice(0, cursor);
    const match = beforeCaret.match(QUERY_RE);
    if (!match) return null;

    const token = match[2];
    const query = token.slice(1);
    if (!query || query.length > MAX_QUERY_LENGTH) return null;

    const start = cursor - token.length;
    return {
      query,
      token,
      start,
      end: cursor
    };
  }

  function normalizeShortcut(shortcut) {
    const value = String(shortcut || "").trim();
    if (!value) return "";
    return value.startsWith(":") ? value : `:${value}`;
  }

  function replaceActiveQuery(value, caret, shortcut) {
    const active = findActiveQuery(value, caret);
    const normalized = normalizeShortcut(shortcut);
    if (!active || !normalized) return null;

    const text = String(value || "");
    const before = text.slice(0, active.start);
    const after = text.slice(active.end);
    const existingSpace = after.match(/^\s/)?.[0] || "";
    const needsTrailingSpace = !existingSpace;
    const insertion = `${normalized}${needsTrailingSpace ? " " : ""}`;
    return {
      value: `${before}${insertion}${after}`,
      caret: before.length + insertion.length + existingSpace.length
    };
  }

  window.CBMultichatEmoticons = {
    findActiveQuery,
    normalizeShortcut,
    replaceActiveQuery
  };
})();
