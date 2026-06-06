(function () {
  const DEFAULT_MIN_HEIGHT = 38;
  const DEFAULT_MAX_HEIGHT = 156;

  function clampSelection(value, index) {
    const length = String(value || "").length;
    const next = Number.isFinite(index) ? index : length;
    return Math.max(0, Math.min(next, length));
  }

  function readSelection(input) {
    if (!input) return null;
    const start = clampSelection(input.value, input.selectionStart);
    const end = clampSelection(input.value, input.selectionEnd);
    return {
      start,
      end: Math.max(start, end),
      direction: input.selectionDirection || "none"
    };
  }

  function rememberComposeSelection(input, store) {
    const selection = readSelection(input);
    if (!selection || !store?.set) return null;
    store.set(input, selection);
    return selection;
  }

  function restoreComposeSelection(input, store, options = {}) {
    const selection = store?.get?.(input);
    if (!input || !selection || typeof input.setSelectionRange !== "function") return false;
    if (options.whenAtStart && (input.selectionStart !== 0 || input.selectionEnd !== 0)) return false;
    const start = clampSelection(input.value, selection.start);
    const end = clampSelection(input.value, selection.end);
    input.setSelectionRange(start, Math.max(start, end), selection.direction || "none");
    return true;
  }

  function resizeComposeInput(input, options = {}) {
    if (!input?.style) return 0;
    const minHeight = Number(options.minHeight) || DEFAULT_MIN_HEIGHT;
    const maxHeight = Number(options.maxHeight) || DEFAULT_MAX_HEIGHT;
    input.style.height = "auto";
    const scrollHeight = Number(input.scrollHeight) || minHeight;
    const nextHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
    return nextHeight;
  }

  function insertTextAtSelection(input, text, store) {
    if (!input) return false;
    restoreComposeSelection(input, store, { whenAtStart: true });
    const selection = readSelection(input);
    if (!selection) return false;
    const value = String(input.value || "");
    const insertion = String(text || "");
    input.value = `${value.slice(0, selection.start)}${insertion}${value.slice(selection.end)}`;
    const next = selection.start + insertion.length;
    input.setSelectionRange?.(next, next, "none");
    rememberComposeSelection(input, store);
    input.dispatchEvent?.(new Event("input", { bubbles: true }));
    return true;
  }

  window.CBMultichatCompose = {
    DEFAULT_MAX_HEIGHT,
    DEFAULT_MIN_HEIGHT,
    insertTextAtSelection,
    rememberComposeSelection,
    resizeComposeInput,
    restoreComposeSelection
  };
})();
