(function () {
  if (window.__CB_MULTICHAT_BOOTED__) return;
  window.__CB_MULTICHAT_BOOTED__ = true;

  const MAX_OPEN_WINDOWS = 4;
  const DEFAULT_CHAT_WIDTH = 390;
  const MIN_CHAT_WIDTH = 180;
  const MIN_USABLE_CHAT_WIDTH = 300;
  const WINDOW_GAP = 12;
  const WINDOW_LEFT_MARGIN = 16;
  const WINDOW_RIGHT_MARGIN = 24;
  const COMPOSE_MAX_HEIGHT = 156;
  const COMPOSE_MIN_HEIGHT = 38;

  const adapter = window.CBMultichatAdapter.createAdapter();
  const emoticons = window.CBMultichatEmoticons;
  const compose = window.CBMultichatCompose;
	  const state = {
	    enabled: true,
	    chats: new Map(),
    openChatIds: [],
    minimizedChatIds: new Set(),
    unread: {},
	    activeChatId: null,
	    debug: null,
	    activeComposeInput: null,
	    composeSelections: new WeakMap(),
	    pointerInsideRoot: false,
	    drafts: new Map(),
	    resizeQueued: false
	  };

	  const DIAGNOSTICS_EVENT = "CBM_COPY_DIAGNOSTICS";
	  const DIAGNOSTICS_ATTR = "data-cbm-diagnostics";

  const ui = {};

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function boot() {
	    const saved = await window.CBMultichatStorage.getState();
	    state.enabled = saved.enabled !== false;
	    state.openChatIds = sanitizeOpenChatIds(
	      Array.isArray(saved.openChatIds) ? saved.openChatIds : []
	    ).slice(0, MAX_OPEN_WINDOWS);
	    state.minimizedChatIds = new Set(
	      (saved.minimizedChatIds || []).filter((id) => state.openChatIds.includes(id))
	    );
	    state.unread = saved.unread || {};

		    buildShell();
		    bindAdapter();
		    bindDiagnosticsBridge();
		    bindFocusGuard();
		    bindResizeGuard();
		    startPopoverWatcher();
	    fitOpenWindowsToViewport();
	    adapter.start();
	    render();
	  }

	  function buildShell() {
	    ui.root = el("div", "cbm-root");
	    ui.root.innerHTML = `
	      <div class="cbm-window-layer"></div>
	    `;
	    document.documentElement.appendChild(ui.root);

	    ui.windowLayer = ui.root.querySelector(".cbm-window-layer");
		    window.CBMultichatDebug = {
		      copyDiagnostics: window.CBMultichatDiagnostics?.copyDiagnostics,
		      collectDiagnostics: window.CBMultichatDiagnostics?.collect,
		      diagnosticsText: window.CBMultichatDiagnostics?.diagnosticsText,
		      copyNetworkDiagnostics: window.CBMultichatNetworkProbeDiagnostics?.copyDiagnostics,
		      networkDiagnosticsText: window.CBMultichatNetworkProbeDiagnostics?.diagnosticsText,
		      enableNetworkProbeForNextReload: window.CBMultichatNetworkProbeDiagnostics?.enableForNextReload,
		      disableNetworkProbeForNextReload: window.CBMultichatNetworkProbeDiagnostics?.disableForNextReload,
		      clearNetworkDiagnostics: window.CBMultichatNetworkProbeDiagnostics?.clear,
		      layoutDiagnostics: collectLayoutDiagnostics
		    };
		  }

	  function bindDiagnosticsBridge() {
	    document.addEventListener(DIAGNOSTICS_EVENT, async () => {
	      const text = window.CBMultichatDiagnostics?.diagnosticsText?.() || "{}";
	      document.documentElement.setAttribute(DIAGNOSTICS_ATTR, text);
	      try {
	        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
	      } catch (error) {
		        console.warn("[KKMA PM+] diagnostics clipboard write failed; read documentElement attribute", error);
	      }
	    });
	  }

		  function bindFocusGuard() {
	    document.addEventListener("pointerdown", (event) => {
	      if (state.activeComposeInput && !event.target?.closest?.(".cbm-root")) {
	        rememberComposeSelection(state.activeComposeInput);
	      }
	      state.pointerInsideRoot = !!event.target?.closest?.(".cbm-root");
	      if (!state.pointerInsideRoot) state.activeComposeInput = null;
	    }, true);

	    document.addEventListener("focusin", (event) => {
	      const activeInput = state.activeComposeInput;
	      if (!activeInput || event.target === activeInput || event.target?.closest?.(".cbm-root")) return;
	      requestAnimationFrame(() => {
	        if (state.activeComposeInput === activeInput) activeInput.focus();
	      });
	    }, true);

	    document.addEventListener("keydown", (event) => {
	      const activeInput = state.activeComposeInput;
	      if (!activeInput || event.target === activeInput || event.target?.closest?.(".cbm-root")) return;
	      if (!handleStolenKey(event, activeInput)) return;
	      event.preventDefault();
	      event.stopImmediatePropagation();
	      event.stopPropagation();
	      restoreComposeSelection(activeInput, { whenAtStart: true });
	      activeInput.focus();
		    }, true);
		  }

	  function bindResizeGuard() {
	    window.addEventListener("resize", () => {
	      if (state.resizeQueued) return;
	      state.resizeQueued = true;
	      requestAnimationFrame(async () => {
	        state.resizeQueued = false;
	        const changed = fitOpenWindowsToViewport();
	        if (!changed) {
	          scheduleRender();
	          return;
	        }
	        await persist();
	        render();
	      });
	    });
	  }

	  function bindAdapter() {
	    adapter.addEventListener("chat", (event) => {
      const chat = event.detail;
      const previous = state.chats.get(chat.id);
      const previousCount = previous?.messages?.length || 0;
      const nextCount = chat.messages?.length || 0;
      state.chats.set(chat.id, chat);

	      if (nextCount > previousCount && !state.openChatIds.includes(chat.id)) {
	        state.unread[chat.id] = (state.unread[chat.id] || 0) + (nextCount - previousCount);
	      }

	      scheduleRender();
	    });

    adapter.addEventListener("message", (event) => {
      const { chatId } = event.detail;
      if (!state.openChatIds.includes(chatId)) {
        state.unread[chatId] = (state.unread[chatId] || 0) + 1;
      }
	      scheduleRender();
	    });

    adapter.addEventListener("debug", (event) => {
      state.debug = event.detail;
    });
  }

		  function sanitizeOpenChatIds(ids) {
	    const seen = new Set();
	    return ids.filter((id) => {
	      const value = String(id || "").trim();
	      if (!value || isGenericNativePmLabel(value) || seen.has(value)) return false;
	      seen.add(value);
	      return true;
	    });
	  }

	  function isGenericNativePmLabel(value) {
	    const text = String(value || "").trim();
	    return /^pm(?:[-_\s]?\d+)?$/i.test(text);
	  }

  async function persist() {
    await window.CBMultichatStorage.setState({
      enabled: state.enabled,
      openChatIds: state.openChatIds,
      minimizedChatIds: Array.from(state.minimizedChatIds),
      unread: state.unread
    });
  }

	  async function openChat(chatId) {
	    if (!state.openChatIds.includes(chatId)) {
	      state.openChatIds = [chatId, ...state.openChatIds].slice(0, MAX_OPEN_WINDOWS);
	    }
	    state.minimizedChatIds.delete(chatId);
	    state.unread[chatId] = 0;
	    state.activeChatId = chatId;
	    fitOpenWindowsToViewport();
	    await persist();
	    render();
	  }

	  async function closeChat(chatId) {
	    snapshotDraft(chatId);
	    state.openChatIds = state.openChatIds.filter((id) => id !== chatId);
	    state.minimizedChatIds.delete(chatId);
	    state.drafts.delete(chatId);
	    await persist();
	    render();
	  }

  async function toggleMinimized(chatId) {
    if (state.minimizedChatIds.has(chatId)) state.minimizedChatIds.delete(chatId);
    else state.minimizedChatIds.add(chatId);
    await persist();
    render();
  }

	  function render() {
	    state.renderQueued = false;
	    ui.root.classList.toggle("cbm-disabled", !state.enabled);
	    renderWindows();
	  }

	  function scheduleRender() {
	    if (state.renderQueued) return;
	    state.renderQueued = true;
	    requestAnimationFrame(render);
	  }

	  function renderWindows() {
	    if (!state.enabled) return;
	    const wantedIds = new Set(state.openChatIds);
	    Array.from(ui.windowLayer.querySelectorAll(".cbm-chat-window")).forEach((windowNode) => {
	      if (!wantedIds.has(windowNode.dataset.chatId)) windowNode.remove();
	    });

	    state.openChatIds.forEach((chatId, index) => {
	      const chat = state.chats.get(chatId);
	      if (!chat) return;

	      const windowNode = getOrCreateWindow(chatId);
	      updateWindowLayout(windowNode, index, chatId);
	      updateWindowContent(windowNode, chat);
	      if (windowNode.parentElement !== ui.windowLayer) {
	        ui.windowLayer.appendChild(windowNode);
	      }
	    });
	  }

	  function getOrCreateWindow(chatId) {
	    const existing = ui.windowLayer.querySelector(`.cbm-chat-window[data-chat-id="${cssEscape(chatId)}"]`);
	    if (existing) return existing;

	    const windowNode = el("section", "cbm-chat-window");
	    windowNode.dataset.chatId = chatId;
	    windowNode.innerHTML = `
	      <header class="cbm-window-head">
	        <button class="cbm-back" title="Focus original PM">‹</button>
	        <strong class="cbm-window-title"></strong>
	        <span class="cbm-window-spacer"></span>
	        <button class="cbm-icon-btn" data-action="minimize" title="Minimize">−</button>
	        <button class="cbm-icon-btn" data-action="close" title="Close">×</button>
	      </header>
	      <div class="cbm-messages"></div>
	      <form class="cbm-compose">
	        <div class="cbm-emoticon-menu" hidden></div>
	        <textarea class="cbm-compose-input" rows="1" placeholder="Private message..." autocomplete="off" spellcheck="false"></textarea>
	        <button class="cbm-send" type="submit" title="Send">➤</button>
	      </form>
	    `;
	    windowNode.querySelector("[data-action='close']").addEventListener("click", () => closeChat(chatId));
	    windowNode.querySelector("[data-action='minimize']").addEventListener("click", () => toggleMinimized(chatId));
	    windowNode.querySelector(".cbm-back").addEventListener("click", () => {
	      const chat = state.chats.get(chatId);
	      chat?.root?.scrollIntoView?.({ block: "center" });
	    });

	    const form = windowNode.querySelector(".cbm-compose");
	    const input = windowNode.querySelector(".cbm-compose-input");
		    isolateTyping(input);
		    bindComposeInput(input);
		    restoreDraft(chatId, input);
		    bindEmoticonAutocomplete(windowNode, chatId, input);
	    bindComposeSubmitKey(windowNode, input);
	    resizeComposeInput(input);
	    form.addEventListener("submit", async (event) => {
	      event.preventDefault();
	      event.stopPropagation();
	      const text = input.value.trim();
	      if (!text) return;
	      closeEmoticonMenu(windowNode);
	      const sent = adapter.sendMessage(chatId, text);
	      if (!sent) {
	        flash(windowNode, "Could not send through page UI");
	        return;
		      }
		      input.value = "";
		      state.drafts.delete(chatId);
		      rememberComposeSelection(input);
		      resizeComposeInput(input);
		    });
	    return windowNode;
	  }

	  function bindComposeInput(input) {
	    const remember = () => rememberComposeSelection(input);
		    const resizeAndRemember = () => {
		      resizeComposeInput(input);
		      rememberDraft(input);
		      rememberComposeSelection(input);
		    };
	    ["keyup", "mouseup", "select", "blur", "focusout", "click"].forEach((eventName) => {
	      input.addEventListener(eventName, remember, true);
	    });
	    ["input", "paste"].forEach((eventName) => {
	      input.addEventListener(eventName, resizeAndRemember, true);
	    });
	    input.addEventListener("focus", () => {
	      restoreComposeSelection(input, { whenAtStart: true });
	    }, true);
	  }

	  function bindComposeSubmitKey(windowNode, input) {
	    input.addEventListener("keydown", (event) => {
	      const menu = windowNode.querySelector(".cbm-emoticon-menu");
	      if (event.key !== "Enter" || event.shiftKey || !menu?.hidden) return;
	      event.preventDefault();
	      event.stopPropagation();
	      input.form?.requestSubmit?.();
	    }, true);
	  }

	  function bindEmoticonAutocomplete(windowNode, chatId, input) {
	    const menu = windowNode.querySelector(".cbm-emoticon-menu");
	    const menuState = {
	      selectedIndex: 0,
	      suggestions: [],
	      requestId: 0
	    };

	    const refresh = async () => {
	      const active = emoticons?.findActiveQuery?.(input.value, input.selectionStart ?? input.value.length);
	      const requestId = menuState.requestId + 1;
	      menuState.requestId = requestId;
	      if (!active) {
	        closeEmoticonMenu(windowNode);
	        return;
	      }
	      const suggestions = await Promise.resolve(adapter.getEmoticonSuggestions?.(chatId, active.query) || []);
	      if (requestId !== menuState.requestId) return;
	      if (!suggestions.length) {
	        closeEmoticonMenu(windowNode);
	        return;
	      }
	      menuState.suggestions = suggestions;
	      menuState.selectedIndex = Math.min(menuState.selectedIndex, suggestions.length - 1);
	      renderEmoticonMenu(windowNode, menuState, input);
	    };

	    input.addEventListener("input", refresh, true);
	    input.addEventListener("click", refresh, true);
	    input.addEventListener("keyup", (event) => {
	      if (["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"].includes(event.key)) return;
	      refresh();
	    }, true);
	    input.addEventListener("keydown", (event) => {
	      if (menu.hidden) return;
	      if (event.key === "Escape") {
	        closeEmoticonMenu(windowNode);
	        event.preventDefault();
	        event.stopPropagation();
	        return;
	      }
	      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
	        const delta = event.key === "ArrowDown" ? 1 : -1;
	        menuState.selectedIndex = (menuState.selectedIndex + delta + menuState.suggestions.length) % menuState.suggestions.length;
	        renderEmoticonMenu(windowNode, menuState, input);
	        event.preventDefault();
	        event.stopPropagation();
	        return;
	      }
	      if (event.key === "Enter" || event.key === "Tab") {
	        const suggestion = menuState.suggestions[menuState.selectedIndex];
	        if (suggestion) {
	          applyEmoticonSuggestion(windowNode, input, suggestion);
	          event.preventDefault();
	          event.stopPropagation();
	        }
	      }
	    }, true);
	  }

	  function renderEmoticonMenu(windowNode, menuState, input) {
	    const menu = windowNode.querySelector(".cbm-emoticon-menu");
	    menu.replaceChildren();
	    menuState.suggestions.forEach((suggestion, index) => {
	      const button = el("button", "cbm-emoticon-option");
	      button.type = "button";
	      button.dataset.index = String(index);
	      button.setAttribute("aria-selected", index === menuState.selectedIndex ? "true" : "false");
	      if (suggestion.previewUrl) {
	        const image = el("img", "cbm-emoticon-preview");
	        image.alt = "";
	        image.src = suggestion.previewUrl;
	        button.appendChild(image);
	      }
	      const label = el("span", "cbm-emoticon-label", suggestion.shortcut || suggestion.label);
	      button.appendChild(label);
	      button.addEventListener("pointerdown", (event) => event.preventDefault());
	      button.addEventListener("click", (event) => {
	        event.preventDefault();
	        event.stopPropagation();
	        applyEmoticonSuggestion(windowNode, input, suggestion);
	      });
	      menu.appendChild(button);
	    });
	    menu.hidden = false;
	  }

	  function applyEmoticonSuggestion(windowNode, input, suggestion) {
	    const replacement = emoticons?.replaceActiveQuery?.(
	      input.value,
	      input.selectionStart ?? input.value.length,
	      suggestion.shortcut
	    );
	    if (!replacement) return;
		    input.value = replacement.value;
		    input.setSelectionRange?.(replacement.caret, replacement.caret);
		    input.dispatchEvent(new Event("input", { bubbles: true }));
		    rememberDraft(input);
		    rememberComposeSelection(input);
		    resizeComposeInput(input);
	    closeEmoticonMenu(windowNode);
	    input.focus();
	  }

	  function closeEmoticonMenu(windowNode) {
	    const menu = windowNode.querySelector?.(".cbm-emoticon-menu");
	    if (!menu) return;
	    menu.hidden = true;
	    menu.replaceChildren();
	  }

	  function isolateTyping(input) {
	    const activate = () => {
	      state.activeComposeInput = input;
	    };
	    const stopOnly = (event) => {
	      activate();
	      event.stopPropagation();
	    };
	    [
	      "pointerdown",
	      "pointerup",
	      "mousedown",
	      "mouseup",
	      "click",
	      "dblclick",
	      "focus",
	      "focusin",
	      "beforeinput",
	      "input",
	      "keydown",
	      "keypress",
	      "keyup",
	      "paste",
	      "compositionstart",
	      "compositionupdate",
	      "compositionend"
	    ].forEach((eventName) => {
	      input.addEventListener(eventName, stopOnly, true);
	      input.addEventListener(eventName, stopOnly, false);
	    });
	  }

	  function handleStolenKey(event, input) {
	    if (event.metaKey || event.ctrlKey || event.altKey) return false;
	    if (event.key === "Escape") {
	      rememberComposeSelection(input);
	      state.activeComposeInput = null;
	      input.blur();
	      return true;
	    }
	    if (event.key === "Backspace") {
	      replaceInputSelection(input, "");
	      return true;
	    }
	    if (event.key === "Enter") {
	      input.form?.requestSubmit?.();
	      return true;
	    }
	    if (event.key && event.key.length === 1) {
	      replaceInputSelection(input, event.key);
	      return true;
	    }
	    return false;
	  }

	  function replaceInputSelection(input, text) {
	    restoreComposeSelection(input, { whenAtStart: true });
	    const start = input.selectionStart ?? input.value.length;
	    const end = input.selectionEnd ?? input.value.length;
	    input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
	    const next = start + text.length;
	    input.setSelectionRange?.(next, next);
		    rememberComposeSelection(input);
		    rememberDraft(input);
		    input.dispatchEvent(new Event("input", { bubbles: true }));
		    resizeComposeInput(input);
		  }

	  function rememberComposeSelection(input) {
	    return compose?.rememberComposeSelection?.(input, state.composeSelections);
	  }

	  function restoreComposeSelection(input, options) {
	    return compose?.restoreComposeSelection?.(input, state.composeSelections, options);
	  }

		  function resizeComposeInput(input) {
		    return compose?.resizeComposeInput?.(input, {
		      maxHeight: COMPOSE_MAX_HEIGHT,
		      minHeight: COMPOSE_MIN_HEIGHT
		    });
		  }

	  function rememberDraft(input) {
	    const chatId = input?.closest?.(".cbm-chat-window")?.dataset?.chatId;
	    if (!chatId) return;
	    if (input.value) state.drafts.set(chatId, input.value);
	    else state.drafts.delete(chatId);
	  }

	  function snapshotDraft(chatId) {
	    const input = ui.windowLayer?.querySelector(
	      `.cbm-chat-window[data-chat-id="${cssEscape(chatId)}"] .cbm-compose-input`
	    );
	    if (!input) return;
	    rememberDraft(input);
	  }

	  function restoreDraft(chatId, input) {
	    if (!input || input.value || !state.drafts.has(chatId)) return;
	    input.value = state.drafts.get(chatId) || "";
	    rememberComposeSelection(input);
	    resizeComposeInput(input);
	  }

	  function maxVisibleWindowsForViewport() {
	    const available = Math.max(0, window.innerWidth - WINDOW_LEFT_MARGIN - WINDOW_RIGHT_MARGIN);
	    const raw = Math.floor((available + WINDOW_GAP) / (MIN_USABLE_CHAT_WIDTH + WINDOW_GAP));
	    return Math.max(1, Math.min(MAX_OPEN_WINDOWS, raw || 1));
	  }

	  function fitOpenWindowsToViewport() {
	    const allowedCount = maxVisibleWindowsForViewport();
	    if (state.openChatIds.length <= allowedCount) return false;
	    state.openChatIds.slice(allowedCount).forEach((chatId) => {
	      snapshotDraft(chatId);
	      state.minimizedChatIds.delete(chatId);
	    });
	    state.openChatIds = state.openChatIds.slice(0, allowedCount);
	    return true;
	  }

		  function updateWindowLayout(windowNode, index, chatId) {
	    const minimized = state.minimizedChatIds.has(chatId);
	    windowNode.classList.toggle("cbm-minimized", minimized);
	    windowNode.style.width = `${windowWidth(index)}px`;
	    windowNode.style.right = `${windowRightOffset(index)}px`;
	    windowNode.style.height = minimized ? "52px" : "";
	    if (minimized) closeEmoticonMenu(windowNode);
	  }

	  function updateWindowContent(windowNode, chat) {
	    windowNode.querySelector(".cbm-window-title").textContent = chat.title || chat.id;
	    const messagesNode = windowNode.querySelector(".cbm-messages");
	    const previousSignature = messagesNode.dataset.messageSignature || "";
	    const nextSignature = messageSignature(chat);
	    if (previousSignature === nextSignature) return;
	    const scrollState = getScrollState(messagesNode);
	    renderMessages(messagesNode, chat);
	    messagesNode.dataset.messageSignature = nextSignature;
	    restoreMessageScroll(messagesNode, scrollState);
	  }

	  function getScrollState(messagesNode) {
	    if (!messagesNode) return null;
    const distanceFromBottom = messagesNode.scrollHeight - messagesNode.scrollTop - messagesNode.clientHeight;
    const anchor = findScrollAnchor(messagesNode);
    return {
      scrollTop: messagesNode.scrollTop,
      stickToBottom: distanceFromBottom <= 24,
      anchorId: anchor?.id || "",
      anchorOffset: anchor?.offset || 0
    };
  }

  function restoreMessageScroll(messagesNode, previous) {
    const applyScroll = () => {
	      if (!previous || previous.stickToBottom) {
        messagesNode.scrollTop = messagesNode.scrollHeight;
        return;
      }
      if (previous.anchorId) {
        const anchorNode = messagesNode.querySelector(`[data-message-id="${cssEscape(previous.anchorId)}"]`);
        if (anchorNode) {
          const containerTop = messagesNode.getBoundingClientRect().top;
          const nextOffset = anchorNode.getBoundingClientRect().top - containerTop;
          messagesNode.scrollTop += nextOffset - previous.anchorOffset;
          return;
        }
      }
      messagesNode.scrollTop = Math.min(previous.scrollTop, messagesNode.scrollHeight);
    };
    applyScroll();
    requestAnimationFrame(applyScroll);
  }

  function findScrollAnchor(messagesNode) {
    const containerTop = messagesNode.getBoundingClientRect().top;
    const items = Array.from(messagesNode.querySelectorAll(".cbm-message"));
    const firstVisible = items.find((item) => item.getBoundingClientRect().bottom > containerTop + 4);
    if (!firstVisible) return null;
    return {
      id: firstVisible.dataset.messageId || "",
      offset: firstVisible.getBoundingClientRect().top - containerTop
    };
  }

	  function messageSignature(chat) {
	    if (chat.error) return `error:${chat.error}`;
	    return (chat.messages || [])
	      .map((message) => `${message.id}:${message.direction}:${message.from || ""}`)
	      .join("|");
	  }

	  function cssEscape(value) {
	    if (window.CSS?.escape) return window.CSS.escape(value);
	    return String(value).replace(/["\\]/g, "\\$&");
	  }

  function startPopoverWatcher() {
    injectButtonsIntoPopovers();
    const observer = new MutationObserver(() => injectButtonsIntoPopovers());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function injectButtonsIntoPopovers() {
    findUserPopovers().forEach((popover) => {
      if (popover.querySelector(".cbm-popover-action")) return;
      const username = extractPopoverUsername(popover);
      if (!username) return;

      const privateAction = findActionByText(popover, "Send private message");
      if (!privateAction) return;
      const anchor = privateAction || findActionByText(popover, "Mention this user");
      const button = buildPopoverButton(username, popover);

      if (anchor?.parentElement) {
        anchor.parentElement.insertBefore(button, anchor.nextSibling);
      } else {
        popover.appendChild(button);
      }
    });
  }

  function findUserPopovers() {
    return Array.from(document.querySelectorAll("div, section, aside"))
      .filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (node.closest(".cbm-root")) return false;
        const text = node.textContent || "";
        if (!/Send private message|Send direct message|Mention this user/i.test(text)) return false;
        const rect = node.getBoundingClientRect();
        if (rect.width < 180 || rect.height < 120) return false;
        if (rect.width > 640 || rect.height > 900) return false;
        return true;
      })
      .sort((a, b) => {
        const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
        const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
        return areaA - areaB;
      })
      .slice(0, 4);
  }

  function extractPopoverUsername(popover) {
    const links = Array.from(popover.querySelectorAll("a"));
    const profileLink = links.find((link) => {
      const text = link.textContent?.trim();
      if (!text || text.length > 40) return false;
      if (/send|mention|trusted|kick|ban|silence|moderator|note/i.test(text)) return false;
      return true;
    });
    if (profileLink) return profileLink.textContent.trim();

    const strongText = Array.from(popover.querySelectorAll("strong, b"))
      .map((node) => node.textContent?.trim())
      .find((text) => text && text.length <= 40 && /^[a-z0-9_-]+$/i.test(text));
    return strongText || "";
  }

  function findActionByText(root, text) {
    const controls = Array.from(root.querySelectorAll("a, button, div, span"))
      .filter((node) => !node.closest(".cbm-root"));
    return controls.find((node) => (node.textContent || "").trim().toLowerCase() === text.toLowerCase());
  }

  function buildPopoverButton(username, popover) {
    const nativeAction = findActionByText(popover, "Send private message");
    const button = document.createElement(nativeAction?.tagName === "A" ? "a" : "button");
    button.type = button.tagName === "BUTTON" ? "button" : undefined;
    button.className = "cbm-popover-action";
    button.href = button.tagName === "A" ? "javascript:void 0" : undefined;
	    button.textContent = "PM+";
	    button.addEventListener("click", async (event) => {
	      event.preventDefault();
	      event.stopPropagation();
	      const originalText = button.textContent;
	      button.textContent = "Opening...";
	      button.setAttribute("aria-busy", "true");
	      const chat = await adapter.openChatForUser(username, popover);
	      button.textContent = chat?.error ? "PM not found" : originalText;
	      button.removeAttribute("aria-busy");
	      if (chat) await openChat(chat.id);
	      if (chat?.error) setTimeout(() => { button.textContent = originalText; }, 1600);
	    });
    return button;
  }

	  function renderMessages(root, chat) {
	    root.replaceChildren();
	    if (chat.error) {
	      root.appendChild(el("div", "cbm-empty-state", chat.error));
	      return;
	    }
	    const messages = chat.messages || [];
	    if (messages.length === 0) {
	      root.appendChild(el("div", "cbm-empty-state", "No PM messages found yet"));
	      return;
	    }
    messages.forEach((message) => {
      const item = el("div", `cbm-message cbm-message-${message.direction === "out" ? "out" : "in"}`);
      item.dataset.messageId = message.id;
      const author = el("div", "cbm-message-author", messageAuthor(message, chat));
      const bubble = el("div", "cbm-bubble");
      bubble.textContent = message.text;
      const meta = el("div", "cbm-message-meta", formatTime(message.ts));
      item.appendChild(author);
      item.appendChild(bubble);
      item.appendChild(meta);
      root.appendChild(item);
    });
  }

  function messageAuthor(message, chat) {
    if (message.direction === "out") return "You";
    return message.from || chat.title || chat.id || "Member";
  }

	  function windowWidth(index) {
	    const openCount = Math.max(1, Math.min(state.openChatIds.length, maxVisibleWindowsForViewport()));
	    const available = Math.max(MIN_CHAT_WIDTH, window.innerWidth - WINDOW_LEFT_MARGIN - WINDOW_RIGHT_MARGIN);
	    const width = Math.floor((available - WINDOW_GAP * (openCount - 1)) / openCount);
	    return Math.max(MIN_CHAT_WIDTH, Math.min(DEFAULT_CHAT_WIDTH, width));
	  }

  function windowRightOffset(index) {
    return WINDOW_RIGHT_MARGIN + index * (windowWidth(index) + WINDOW_GAP);
  }

  function lastMessage(chat) {
    return chat.messages?.[chat.messages.length - 1];
  }

  function formatTime(ts) {
    const date = new Date(ts || Date.now());
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

	  function flash(windowNode, text) {
	    const notice = el("div", "cbm-flash", text);
	    windowNode.appendChild(notice);
	    setTimeout(() => notice.remove(), 1800);
	  }

	  function collectLayoutDiagnostics() {
	    return {
	      viewportWidth: window.innerWidth,
	      maxVisibleWindows: maxVisibleWindowsForViewport(),
	      openChatIds: state.openChatIds.slice(),
	      windows: Array.from(ui.windowLayer?.querySelectorAll(".cbm-chat-window") || []).map((windowNode) => {
	        const send = windowNode.querySelector(".cbm-send");
	        const composeNode = windowNode.querySelector(".cbm-compose");
	        const rect = windowNode.getBoundingClientRect();
	        const sendRect = send?.getBoundingClientRect();
	        const composeRect = composeNode?.getBoundingClientRect();
	        return {
	          chatId: windowNode.dataset.chatId,
	          minimized: windowNode.classList.contains("cbm-minimized"),
	          width: Math.round(rect.width),
	          right: Math.round(window.innerWidth - rect.right),
	          send: sendRect ? {
	            width: Math.round(sendRect.width),
	            height: Math.round(sendRect.height),
	            visible: sendRect.right <= rect.right && sendRect.left >= rect.left
	          } : null,
	          compose: composeRect ? {
	            width: Math.round(composeRect.width),
	            height: Math.round(composeRect.height)
	          } : null
	        };
	      })
	    };
	  }

	  boot().catch((error) => {
    console.error("[KKMA PM+] boot failed", error);
  });
})();
