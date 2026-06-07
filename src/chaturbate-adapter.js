(function () {
  const DEMO_CHAT_SELECTOR = "[data-cbm-chat]";
  const DEMO_MESSAGE_SELECTOR = "[data-cbm-message]";

	  const GENERIC_PM_ROOT_SELECTORS = [
	    "[class*='private'][class*='message' i]",
	    "[class*='pm' i]",
	    "[id*='private'][id*='message' i]",
    "[id*='pm' i]",
    "[data-testid*='pm' i]",
	    "[data-testid*='private' i]"
	  ];

	  const CHATURBATE_PM_ROOT_SELECTOR = [
	    ".ChatTabContents.TheatermodeChatDivPm",
	    ".ChatTabContents[class*='Pm']",
	    "[class*='pm-control-bar' i]"
	  ].join(",");
	  const CHATURBATE_PM_INPUT_SELECTOR = [
	    ".theatermodeInputFieldPm[contenteditable='true']",
	    ".inputFieldChatPlaceholder[contenteditable='true']",
	    "[contenteditable='true']",
	    "textarea",
	    "input[type='text']"
	  ].join(",");
	  const CHATURBATE_PM_SEND_SELECTOR = [
	    "button.SendButton.SplitMode.pm",
	    "button.SendButton.pm",
	    "button[class*='SendButton'][class*='pm']",
	    "button[type='submit']",
	    "button[class*='send' i]",
	    "[role='button'][class*='send' i]"
	  ].join(",");
	  const CHATURBATE_MESSAGE_SELECTOR = [
	    ".msg-text",
	    "[data-testid*='message' i]",
	    "[class*='message' i]",
	    "[class*='msg' i]",
	    "li",
	    "p"
	  ].join(",");
	  const CHATURBATE_EMOTICON_POPUP_SELECTOR = [
	    "[class*='emoticon' i]",
	    "[class*='emoji' i]",
	    "[class*='autocomplete' i]",
	    "[class*='suggest' i]",
	    "[role='listbox']",
	    "[role='menu']"
	  ].join(",");
	  const CHATURBATE_EMOTICON_ITEM_SELECTOR = [
	    "[role='option']",
	    "[role='menuitem']",
	    "button",
	    "a",
	    "li",
	    ".modalItem",
	    "[class*='emoticon' i]",
	    "[class*='emoji' i]",
	    "[class*='suggest' i]"
	  ].join(",");
	  const DEMO_EMOTICONS = [
	    { shortcut: ":heart", label: "heart" },
	    { shortcut: ":hello", label: "hello" },
	    { shortcut: ":hugs", label: "hugs" },
	    { shortcut: ":happy", label: "happy" },
	    { shortcut: ":kiss", label: "kiss" },
	    { shortcut: ":love", label: "love" },
	    { shortcut: ":thanks", label: "thanks" },
	    { shortcut: ":wave", label: "wave" }
		  ];
		  const CHATURBATE_EMOTICON_AUTOCOMPLETE_ENDPOINT = "/api/ts/emoticons/autocomplete/";
		  const MAX_MESSAGE_PARTS = 24;
		  const MAX_MESSAGE_IMAGES = 8;
		  const MAX_MESSAGE_ATTACHMENTS = 4;
		  const RICH_MESSAGE_IMAGE_RE = /emoticon|emoji|smiley|sticker/i;
		  const NON_MESSAGE_IMAGE_RE = /avatar|profile|photo|media|thumbnail|private|preview/i;
		  const PHOTO_ATTACHMENT_RE = /photo|image|media|attachment|thumbnail|private|preview/i;
		  const PHOTO_OPEN_ACTION_RE = /open\s+photo|view\s+photo|show\s+photo|open\s+image|view\s+image/i;
		  const CHATURBATE_NON_ROOM_PATHS = new Set([
	    "accounts",
	    "api",
	    "apps",
	    "auth",
	    "b",
	    "broadcast",
	    "emoticons",
	    "login",
	    "p",
	    "supporter",
	    "terms"
	  ]);

  function normalizeId(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

	  function textFromNode(node) {
	    return (node?.textContent || "").replace(/\s+/g, " ").trim();
	  }

		  function compactLower(value) {
		    return String(value || "").replace(/\s+/g, "").toLowerCase();
		  }

		  function normalizePartText(value, maxLength = 500) {
		    return String(value || "").replace(/\s+/g, " ").slice(0, maxLength);
		  }

		  function appendTextPart(parts, value) {
		    const text = normalizePartText(value);
		    if (!text) return;
		    const last = parts[parts.length - 1];
		    if (last?.type === "text") {
		      last.text = `${last.text}${text}`;
		      return;
		    }
		    parts.push({ type: "text", text });
		  }

		  function normalizeMessageParts(parts, fallbackText = "") {
		    const normalized = [];
		    const inputParts = Array.isArray(parts) ? parts : [];
		    inputParts.forEach((part) => {
		      if (!part || normalized.length >= MAX_MESSAGE_PARTS) return;
		      if (part.type === "image") {
		        const src = normalizeImageSrc(part.src);
		        if (!src) return;
		        normalized.push({
		          type: "image",
		          kind: part.kind === "emoji" ? "emoji" : "emoticon",
		          src,
		          alt: normalizePartText(part.alt, 80),
		          title: normalizePartText(part.title, 80),
		          width: clampImageSize(part.width),
		          height: clampImageSize(part.height)
		        });
		        return;
		      }
		      appendTextPart(normalized, part.text);
		    });

		    if (normalized.length === 0 && fallbackText) {
		      appendTextPart(normalized, fallbackText);
		    }
		    return trimPartEdges(normalized).slice(0, MAX_MESSAGE_PARTS);
		  }

		  function trimPartEdges(parts) {
		    const trimmed = parts.map((part) => ({ ...part }));
		    if (trimmed[0]?.type === "text") trimmed[0].text = trimmed[0].text.trimStart();
		    if (trimmed[trimmed.length - 1]?.type === "text") {
		      trimmed[trimmed.length - 1].text = trimmed[trimmed.length - 1].text.trimEnd();
		    }
		    return trimmed.filter((part) => part.type !== "text" || part.text);
		  }

		  function textFromParts(parts) {
		    return (parts || [])
		      .map((part) => part.type === "image" ? part.alt || part.title || "" : part.text || "")
		      .join("")
		      .replace(/\s+/g, " ")
		      .trim();
		  }

		  function messagePartsSignature(parts) {
		    return (parts || [])
		      .map((part) => part.type === "image" ? `${part.kind}:${part.alt || part.title || ""}` : part.text || "")
		      .join("")
		      .slice(0, 40);
		  }

		  function normalizeImageSrc(src) {
		    const value = String(src || "").trim();
		    if (!value) return "";
		    if (/^https?:\/\//i.test(value) || value.startsWith("data:image/")) return value.slice(0, 500);
		    if (value.startsWith("//")) return `https:${value}`.slice(0, 500);
		    return "";
		  }

		  function clampImageSize(value) {
		    const number = Number(value) || 0;
		    if (!number) return 0;
		    return Math.max(1, Math.min(128, Math.round(number)));
		  }

		  function stripLeadingTextFromParts(parts, prefix) {
		    let remaining = String(prefix || "").length;
		    const stripped = [];
		    (parts || []).forEach((part) => {
		      if (part.type !== "text" || remaining <= 0) {
		        stripped.push({ ...part });
		        return;
		      }
		      const text = part.text || "";
		      if (text.length <= remaining) {
		        remaining -= text.length;
		        return;
		      }
		      stripped.push({ ...part, text: text.slice(remaining).trimStart() });
		      remaining = 0;
		    });
		    return normalizeMessageParts(stripped);
		  }

		  function normalizeMessageAttachments(input) {
		    if (!Array.isArray(input)) return [];
		    return input.slice(0, MAX_MESSAGE_ATTACHMENTS).map((attachment) => {
		      if (!attachment || attachment.type !== "photo") return null;
		      const id = normalizePartText(attachment.id, 80);
		      if (!id) return null;
		      const state = ["unopened", "opened", "unknown"].includes(attachment.state) ? attachment.state : "unknown";
		      const previewPolicy = attachment.previewPolicy === "visible-thumbnail" ? "visible-thumbnail" : "none";
		      const previewUrl = previewPolicy === "visible-thumbnail"
		        ? normalizeImageSrc(attachment.previewUrl)
		        : "";
		      return {
		        id,
		        type: "photo",
		        state,
		        previewPolicy,
		        previewUrl,
		        previewIsBlurred: attachment.previewIsBlurred === true || attachment.previewIsBlurred === false
		          ? attachment.previewIsBlurred
		          : "unknown",
		        actionKind: attachment.actionKind === "open-photo" ? "open-photo" : "",
		        nativeActionKey: normalizePartText(attachment.nativeActionKey, 120)
		      };
		    }).filter(Boolean);
		  }

		  function messageAttachmentIdentitySignature(attachments) {
		    return (attachments || []).map((attachment) => `${attachment.type || ""}:${attachment.id || ""}`).join("");
		  }

	  function createMessage({ id, from, text, parts, attachments, direction, ts }) {
	    const messageParts = normalizeMessageParts(parts, text);
	    const fallbackText = text || textFromParts(messageParts);
	    const messageAttachments = normalizeMessageAttachments(attachments);
	    return {
	      id: id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
	      from: from || "member",
	      text: fallbackText || "",
	      parts: messageParts,
	      attachments: messageAttachments,
	      direction: direction || "in",
	      ts: ts || Date.now()
	    };
  }

  class BaseAdapter extends EventTarget {
    constructor() {
      super();
      this.chats = new Map();
      this.observer = null;
	      this.debug = {
	        mode: "base",
	        scanCount: 0,
	        candidateCount: 0,
	        selectorHits: [],
	        lastScanAt: 0,
	        emoticonSource: {
	          kind: "",
	          status: 0,
	          count: 0,
	          latencyMs: 0
	        }
	      };
    }

    emitChat(chat) {
      if (!chat?.id) return;
      const previous = this.chats.get(chat.id);
      const merged = {
        ...previous,
        ...chat,
        messages: chat.messages || previous?.messages || []
      };
      this.chats.set(chat.id, merged);
      this.dispatchEvent(new CustomEvent("chat", { detail: merged }));
    }

    emitMessage(chatId, message) {
      const chat = this.chats.get(chatId);
      if (!chat) return;
      if (chat.messages.some((item) => item.id === message.id)) return;
      chat.messages.push(message);
      this.emitChat(chat);
      this.dispatchEvent(new CustomEvent("message", { detail: { chatId, message } }));
    }

    getChats() {
      return Array.from(this.chats.values());
    }

	    ensureChatForUser(username, sourceRoot) {
	      const title = String(username || "").trim();
      if (!title) return null;
      const id = normalizeId(title);
      const existing = this.chats.get(id);
      if (existing) return existing;

      const chat = {
        id,
        title,
        root: sourceRoot || null,
        messages: []
      };
	      this.emitChat(chat);
	      return chat;
	    }

	    async openChatForUser(username, sourceRoot) {
	      return this.ensureChatForUser(username, sourceRoot);
	    }

    start() {}

    sendMessage() {
      return false;
    }

	    getEmoticonSuggestions() {
	      return [];
	    }

    emitDebug() {
      this.dispatchEvent(new CustomEvent("debug", { detail: { ...this.debug } }));
    }
  }

  class DemoAdapter extends BaseAdapter {
    constructor() {
      super();
      this.debug.mode = "demo";
    }

    start() {
      this.scan();
      this.observer = new MutationObserver(() => this.scan());
      this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    scan() {
      this.debug.scanCount += 1;
      this.debug.lastScanAt = Date.now();
      const roots = Array.from(document.querySelectorAll(DEMO_CHAT_SELECTOR));
      this.debug.candidateCount = roots.length;
      this.debug.selectorHits = [{ selector: DEMO_CHAT_SELECTOR, count: roots.length }];
      roots.forEach((root) => {
        const id = normalizeId(root.dataset.cbmChat);
        const title = root.dataset.cbmName || root.dataset.cbmChat || "member";
        const messages = Array.from(root.querySelectorAll(DEMO_MESSAGE_SELECTOR)).map((node, index) =>
          createMessage({
            id: node.dataset.cbmId || `${id}-${index}-${textFromNode(node)}`,
            from: node.dataset.cbmFrom || title,
            text: textFromNode(node),
            direction: node.dataset.cbmDirection || "in",
            ts: Number(node.dataset.cbmTs) || Date.now() - (1000 * (100 - index))
          })
        );

        this.emitChat({ id, title, root, messages });
      });
      this.emitDebug();
    }

    sendMessage(chatId, text) {
      const chat = this.chats.get(chatId);
      if (!chat?.root || !text.trim()) return false;

      const message = document.createElement("div");
      message.dataset.cbmMessage = "true";
      message.dataset.cbmDirection = "out";
      message.dataset.cbmFrom = "me";
      message.textContent = text.trim();
      chat.root.appendChild(message);
      this.scan();
      return true;
    }

	    getEmoticonSuggestions(chatId, query) {
	      const needle = String(query || "").toLowerCase();
	      if (!needle) return [];
	      return DEMO_EMOTICONS
	        .filter((item) => item.shortcut.slice(1).toLowerCase().startsWith(needle))
	        .slice(0, 20);
	    }
  }

	  class ChaturbateDomAdapter extends BaseAdapter {
	    constructor() {
	      super();
	      this.debug.mode = "chaturbate-dom";
	      this.selfName = this.detectSelfName();
	      this.roomName = this.detectRoomName();
	      this.rootChatIds = new WeakMap();
	      this.emoticonSuggestionCache = [];
	      this.emoticonApiCache = new Map();
	    }

    start() {
      this.scan();
      this.observer = new MutationObserver(() => this.scan());
      this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

	    scan() {
	      this.debug.scanCount += 1;
	      this.debug.lastScanAt = Date.now();
	      const roots = this.findPmRoots();
	      const selectorHits = [
	        { selector: CHATURBATE_PM_ROOT_SELECTOR, count: roots.length }
	      ];

	      this.debug.candidateCount = roots.length;
	      this.debug.selectorHits = selectorHits.filter((item) => item.count > 0).slice(0, 8);
	      if (window.CB_MULTICHAT_DEBUG && (this.debug.scanCount === 1 || roots.length > 0)) {
	        console.info("[KKMA PM+] PM scan", this.debug);
	      }

			      roots.slice(0, 12).forEach((root, index) => {
			        const boundId = this.rootChatIds.get(root);
			        const existing = boundId ? this.chats.get(boundId) : null;
			        const label = existing?.title || this.extractTitle(root) || `PM ${index + 1}`;
			        const id = boundId || normalizeId(root.id || root.getAttribute("data-testid") || label || `pm-${index}`);
			        const messages = this.extractMessages(root, id);
			        this.emitChat({
			          id,
			          title: label,
			          root,
			          messages,
			          boundToUser: Boolean(boundId),
			          source: "chaturbate-pm",
			          isGenericNativePm: !boundId
			        });
		      });
      this.emitDebug();
    }

    extractTitle(root) {
      const candidates = [
        root.querySelector("[class*='username' i]"),
        root.querySelector("[class*='user-name' i]"),
        root.querySelector("[class*='title' i]"),
        root.querySelector("header"),
        root.querySelector("h1,h2,h3")
      ].filter(Boolean);

      for (const node of candidates) {
        const text = textFromNode(node);
        if (text && text.length <= 60) return text;
      }

      const aria = root.getAttribute("aria-label");
      if (aria) return aria;
	      return "";
	    }

	    async openChatForUser(username, sourceRoot) {
	      const title = String(username || "").trim();
	      if (!title) return null;
	      const id = normalizeId(title);
	      const existing = this.chats.get(id);
	      if (existing?.root?.isConnected) return existing;

	      const beforeRoots = new Set(this.findPmRoots());
	      const nativeAction = this.findNativePrivateMessageAction(sourceRoot);
	      if (nativeAction) this.activateNativeAction(nativeAction);

	      const likelyPmRoot = await this.waitForPmRoot(title, beforeRoots);
	      if (!likelyPmRoot) {
	        const chat = {
	          id,
	          title,
	          root: null,
	          messages: [],
	          error: "Native PM window was not found"
	        };
	        this.emitChat(chat);
	        return chat;
	      }

			      const chat = {
			        id,
			        title,
			        root: likelyPmRoot,
			        messages: this.extractMessages(likelyPmRoot, id),
			        error: "",
			        boundToUser: true,
			        source: "chaturbate-pm",
			        isGenericNativePm: false
			      };
		      this.rootChatIds.set(likelyPmRoot, id);
		      this.emitChat(chat);
		      return chat;
		    }

    ensureChatForUser(username, sourceRoot) {
      const title = String(username || "").trim();
      if (!title) return null;
      const id = normalizeId(title);
      const existing = this.chats.get(id);
      if (existing) return existing;

      const likelyPmRoot = this.findPmRootForUser(title) || sourceRoot || null;
      const messages = likelyPmRoot ? this.extractMessages(likelyPmRoot, id) : [];
	      const chat = {
	        id,
	        title,
	        root: likelyPmRoot,
	        messages,
	        boundToUser: Boolean(likelyPmRoot && this.rootChatIds.get(likelyPmRoot) === id),
	        source: likelyPmRoot ? "chaturbate-pm" : "chaturbate-popover",
	        isGenericNativePm: false
	      };
      this.emitChat(chat);
      return chat;
    }

    findPmRootForUser(username) {
      const needle = username.toLowerCase();
      const candidates = Array.from(document.querySelectorAll("div, section, aside, article"))
        .filter((node) => {
          const text = textFromNode(node).toLowerCase();
          if (!text.includes(needle)) return false;
          if (text.length > 2500) return false;
          return /private|direct|message|pm|chat/i.test(node.className || node.id || text);
        })
        .sort((a, b) => textFromNode(a).length - textFromNode(b).length);
      return candidates[0] || null;
    }

	    findNativePrivateMessageAction(sourceRoot) {
	      if (!sourceRoot) return null;
	      const controls = Array.from(sourceRoot.querySelectorAll("a, button, [role='button'], div, span"))
	        .filter((node) => /send private message/i.test(textFromNode(node)))
	        .sort((a, b) => textFromNode(a).length - textFromNode(b).length);
	      const control = controls[0];
	      return control ? this.nearestActionContainer(control, sourceRoot) : null;
	    }

	    nearestActionContainer(node, boundary) {
	      let current = node;
	      let best = node;
	      for (let depth = 0; current && current !== boundary && depth < 6; depth += 1) {
	        const rect = current.getBoundingClientRect?.();
	        const text = textFromNode(current);
	        if (rect && rect.width >= 120 && rect.height >= 24 && text.length <= 80) best = current;
	        if (current.matches?.("a, button, [role='button']")) return current;
	        current = current.parentElement;
	      }
	      return best;
	    }

	    activateNativeAction(node, options = {}) {
	      const singleClick = options.singleClick === true;
	      const eventTypes = singleClick ? ["pointerdown", "mousedown", "mouseup"] : ["pointerdown", "mousedown", "mouseup", "click"];
	      eventTypes.forEach((type) => {
	        const EventCtor = type.startsWith("pointer") && typeof PointerEvent !== "undefined"
	          ? PointerEvent
	          : MouseEvent;
	        node.dispatchEvent(new EventCtor(type, {
	          bubbles: true,
	          cancelable: true,
	          composed: true,
	          button: 0,
	          buttons: type.endsWith("down") ? 1 : 0,
	          view: window
	        }));
	      });
	      if (typeof node.click === "function") node.click();
	      else if (singleClick) {
	        node.dispatchEvent(new MouseEvent("click", {
	          bubbles: true,
	          cancelable: true,
	          composed: true,
	          button: 0,
	          buttons: 0,
	          view: window
	        }));
	      }
	    }

	    findPmRoots() {
	      return Array.from(document.querySelectorAll(CHATURBATE_PM_ROOT_SELECTOR))
	        .map((node) => node.classList?.contains("pm-control-bar") ? node.closest(".ChatTabContents") : node)
	        .filter((node, index, nodes) => node && nodes.indexOf(node) === index)
	        .filter((node) => node instanceof HTMLElement)
	        .filter((node) => node.querySelector(CHATURBATE_PM_INPUT_SELECTOR) || /TheatermodeChatDivPm/.test(node.className || ""))
	        .sort((a, b) => this.scorePmRoot(b) - this.scorePmRoot(a));
	    }

	    scorePmRoot(root) {
	      let score = 0;
	      if (/TheatermodeChatDivPm/.test(root.className || "")) score += 20;
	      if (root.querySelector(".theatermodeInputFieldPm")) score += 10;
	      if (root.querySelector("button.SendButton.SplitMode.pm")) score += 10;
	      if (root.querySelector(".message-list")) score += 5;
	      const rect = root.getBoundingClientRect?.();
	      if (rect && rect.width > 200 && rect.height > 200) score += 4;
	      return score;
	    }

	    findBestPmRoot(username, beforeRoots) {
	      const needle = String(username || "").toLowerCase();
	      const roots = this.findPmRoots();
	      const newRoot = roots.find((root) => !beforeRoots?.has(root));
	      if (newRoot) return newRoot;
	      const namedRoot = roots.find((root) => needle && textFromNode(root).toLowerCase().includes(needle));
	      return namedRoot || roots[0] || null;
	    }

	    waitForPmRoot(username, beforeRoots, timeoutMs = 2500) {
	      const immediate = this.findBestPmRoot(username, beforeRoots);
	      if (immediate) return Promise.resolve(immediate);

	      return new Promise((resolve) => {
	        let done = false;
	        const finish = (root) => {
	          if (done) return;
	          done = true;
	          observer.disconnect();
	          clearTimeout(timer);
	          resolve(root);
	        };
	        const observer = new MutationObserver(() => {
	          const root = this.findBestPmRoot(username, beforeRoots);
	          if (root) finish(root);
	        });
	        const timer = setTimeout(() => finish(null), timeoutMs);
	        observer.observe(document.body, { childList: true, subtree: true });
	      });
	    }

	    extractMessages(root, chatId) {
	      const messageNodes = this.findMessageNodes(root);

	      return Array.from(messageNodes)
		        .map((node, index) => {
			          const parsed = this.parseMessageNode(node, chatId, index);
			          if (!this.isUserMessage(parsed.text, parsed.parts, parsed.attachments)) return null;
			          return createMessage({
			            id: this.messageIdForParsed(chatId, index, parsed),
			            from: parsed.from,
			            text: parsed.text,
			            parts: parsed.parts,
			            attachments: parsed.attachments,
			            direction: parsed.direction
			          });
			        })
	        .filter(Boolean)
	        .slice(-80);
	    }

	    findMessageNodes(root) {
	      const messageLists = Array.from(root.querySelectorAll(".message-list, .msg-list-fvm"));
	      const listChildren = messageLists.flatMap((list) => Array.from(list.children || []))
	        .filter((node) => this.looksLikeMessageNode(node));
	      if (listChildren.length > 0) return listChildren;

	      const leafMessageNodes = Array.from(root.querySelectorAll(".msg-text"))
	        .filter((node) => !node.querySelector?.(".msg-text"))
	        .filter((node) => this.looksLikeMessageNode(node));
	      if (leafMessageNodes.length > 0) return leafMessageNodes;

	      return Array.from(root.querySelectorAll(CHATURBATE_MESSAGE_SELECTOR))
	        .filter((node) => this.looksLikeMessageNode(node));
	    }

		    looksLikeMessageNode(node) {
		      const text = textFromNode(node);
			      const hasRichMessagePart = this.extractMessageParts(node).some((part) => part.type === "image");
			      const hasAttachment = this.hasMessageAttachment(node);
			      if (!text && !hasRichMessagePart && !hasAttachment) return false;
		      if (node.querySelector?.(CHATURBATE_PM_INPUT_SELECTOR)) return false;
		      if (node.querySelector?.(CHATURBATE_PM_SEND_SELECTOR)) return false;
	      if (/PMControlBar|control-bar|searchUserInput|customInput/.test(String(node.className || ""))) return false;
	      return true;
	    }

			    parseMessageNode(node, chatId, messageIndex = 0) {
			      const contentNode = this.findMessageContentNode(node);
			      const rawParts = this.extractMessageParts(contentNode || node);
			      const attachments = this.extractMessageAttachments(node, chatId, messageIndex);
			      const raw = textFromParts(rawParts) || (attachments.length ? "" : this.extractMessageText(node));
		      const fullText = textFromNode(node);
		      const authorPrefix = this.extractMessageAuthorPrefix(fullText, raw);
	      const className = String(node.className || "");
	      const selfName = this.selfName;
		      const memberName = String(chatId || "");
		      let direction = /my|sent|out|self|me/i.test(className) ? "out" : "in";
		      let text = raw;
		      let parts = rawParts;

		      if (this.authorMatches(authorPrefix, selfName) || (!authorPrefix && this.authorMatches(fullText, selfName))) {
		        direction = "out";
		      } else if (this.authorMatches(authorPrefix, memberName) || (!authorPrefix && this.authorMatches(fullText, memberName))) {
		        direction = "in";
		      } else if (selfName && compactLower(raw).startsWith(compactLower(selfName))) {
		        direction = "out";
		        text = raw.slice(selfName.length).trim();
		        parts = stripLeadingTextFromParts(parts, selfName);
		      } else if (memberName && compactLower(raw).startsWith(compactLower(memberName))) {
		        direction = "in";
		        text = raw.slice(memberName.length).trim();
		        parts = stripLeadingTextFromParts(parts, memberName);
		      }

			      return {
			        text: text || textFromParts(parts) || raw,
			        parts: normalizeMessageParts(parts, text || raw),
			        attachments,
			        direction,
			        from: direction === "out" ? selfName || "You" : memberName || "member"
		      };
		    }

		    messageIdForParsed(chatId, index, parsed) {
		      const suffix = parsed.text || messagePartsSignature(parsed.parts) || messageAttachmentIdentitySignature(parsed.attachments);
		      return `${chatId}-${index}-${String(suffix || "message").slice(0, 40)}`;
		    }

	    extractMessageAuthorPrefix(fullText, messageText) {
	      if (!fullText || !messageText || fullText === messageText) return "";
	      if (fullText.endsWith(messageText)) return fullText.slice(0, -messageText.length).trim();
	      const index = fullText.indexOf(messageText);
	      return index > 0 ? fullText.slice(0, index).trim() : "";
	    }

	    authorMatches(authorPrefix, username) {
	      if (!authorPrefix || !username) return false;
	      return compactLower(authorPrefix).endsWith(compactLower(username));
	    }

		    findMessageContentNode(node) {
		      const leaf = node.matches?.(".msg-text") && !node.querySelector?.(".msg-text")
		        ? node
		        : Array.from(node.querySelectorAll?.(".msg-text") || []).find((item) => !item.querySelector?.(".msg-text"));
		      return leaf || node;
		    }

		    extractMessageText(node) {
		      return textFromNode(this.findMessageContentNode(node));
		    }

			    extractMessageParts(node) {
			      const parts = [];
			      let imageCount = 0;
			      const visit = (current, isRoot = false) => {
			        if (!current || parts.length >= MAX_MESSAGE_PARTS) return;
			        if (current.nodeType === 3) {
			          appendTextPart(parts, current.nodeValue || current.textContent || "");
			          return;
			        }
			        if (current.nodeType && current.nodeType !== 1) return;
			        if (this.isServiceContentNode(current)) return;
			        if (this.isPhotoMediaNode(current) || (!isRoot && this.isPhotoControlNode(current))) return;
			        if (this.isRichMessageImage(current)) {
		          if (imageCount >= MAX_MESSAGE_IMAGES) return;
		          imageCount += 1;
		          parts.push(this.parseRichMessageImage(current));
		          return;
		        }
			        const children = Array.from(current.childNodes || current.children || []);
			        if (children.length > 0) {
			          children.forEach((child) => visit(child, false));
			          return;
			        }
			        appendTextPart(parts, current.textContent || "");
			      };
			      visit(node, true);
			      return normalizeMessageParts(parts);
			    }

		    isServiceContentNode(node) {
		      if (!node || String(node.tagName || "").toLowerCase() === "img") return false;
		      const text = textFromNode(node);
		      const fingerprint = [
		        node.className,
		        node.getAttribute?.("data-testid"),
		        node.getAttribute?.("aria-label"),
		        node.getAttribute?.("role")
		      ].join(" ");
		      if (/PMControlBar|control-bar|searchUserInput|customInput/i.test(fingerprint)) return true;
		      if (/^new$/i.test(text)) return true;
		      return /^loading more messages$/i.test(text);
		    }

		    isRichMessageImage(node) {
		      if (String(node?.tagName || "").toLowerCase() !== "img") return false;
		      const src = normalizeImageSrc(node.currentSrc || node.src || node.getAttribute?.("src"));
		      if (!src) return false;
		      const alt = node.alt || node.getAttribute?.("alt") || "";
		      const title = node.title || node.getAttribute?.("title") || "";
		      const fingerprint = [
		        node.className,
		        node.getAttribute?.("data-testid"),
		        node.getAttribute?.("data-emoticon"),
		        node.getAttribute?.("data-emoji"),
		        alt,
		        title
		      ].join(" ");
		      if (NON_MESSAGE_IMAGE_RE.test(fingerprint) && !RICH_MESSAGE_IMAGE_RE.test(fingerprint)) return false;
		      return RICH_MESSAGE_IMAGE_RE.test(fingerprint) ||
		        /:[a-z0-9_-]{1,40}/i.test(`${alt} ${title}`) ||
		        /[\u{1F000}-\u{1FAFF}]/u.test(`${alt} ${title}`);
		    }

		    parseRichMessageImage(node) {
		      const alt = node.alt || node.getAttribute?.("alt") || "";
		      const title = node.title || node.getAttribute?.("title") || "";
		      const fingerprint = `${node.className || ""} ${alt} ${title}`;
		      return {
		        type: "image",
		        kind: /emoji/i.test(fingerprint) && !/emoticon/i.test(fingerprint) ? "emoji" : "emoticon",
		        src: normalizeImageSrc(node.currentSrc || node.src || node.getAttribute?.("src")),
		        alt: normalizePartText(alt || title, 80),
		        title: normalizePartText(title, 80),
		        width: clampImageSize(node.width || node.getAttribute?.("width")),
		        height: clampImageSize(node.height || node.getAttribute?.("height"))
		      };
		    }

			    hasMessageAttachment(node) {
			      return this.findPhotoAttachmentContainers(node).length > 0;
			    }

			    extractMessageAttachments(node, chatId, messageIndex = 0) {
			      return normalizeMessageAttachments(this.findPhotoAttachmentContainers(node)
			        .slice(0, MAX_MESSAGE_ATTACHMENTS)
			        .map((container, attachmentIndex) => this.parsePhotoAttachment(container, chatId, messageIndex, attachmentIndex)));
			    }

			    parsePhotoAttachment(container, chatId, messageIndex, attachmentIndex) {
			      const action = this.findPhotoOpenControl(container);
			      const state = this.classifyPhotoAttachmentState(container);
			      return {
			        id: `photo-${messageIndex}-${attachmentIndex}`,
			        type: "photo",
			        state,
			        previewPolicy: "visible-thumbnail",
			        previewUrl: this.photoPreviewUrl(container),
			        previewIsBlurred: state !== "opened",
			        actionKind: action ? "open-photo" : "",
			        nativeActionKey: `${chatId}:${messageIndex}:${attachmentIndex}:open-photo`
			      };
			    }

			    findPhotoAttachmentContainers(node) {
			      const containers = [];
			      const seen = new Set();
			      const add = (container) => {
			        if (!container || seen.has(container)) return;
			        seen.add(container);
			        containers.push(container);
			      };
			      const visit = (current) => {
			        if (!current || current.nodeType !== 1) return;
			        if (this.isPhotoAttachmentContainer(current)) {
			          add(current);
			          return;
			        }
			        if (this.isPhotoMediaNode(current) || this.isPhotoControlNode(current)) {
			          add(this.nearestPhotoAttachmentContainer(current, node));
			          return;
			        }
			        Array.from(current.children || []).forEach(visit);
			      };
			      visit(node);
			      return containers;
			    }

			    nearestPhotoAttachmentContainer(node, root) {
			      let current = node;
			      let best = node;
			      while (current && current !== root?.parentElement) {
			        const fingerprint = `${current.className || ""} ${current.getAttribute?.("data-testid") || ""}`;
			        if (/msg-row|message|photo|media|attachment|private/i.test(fingerprint)) best = current;
			        if (current === root) break;
			        current = current.parentElement;
			      }
			      return best || root || node;
			    }

			    isPhotoAttachmentContainer(node) {
			      if (!node || node.nodeType !== 1) return false;
			      const fingerprint = [
			        node.className,
			        node.getAttribute?.("data-testid"),
			        node.getAttribute?.("aria-label"),
			        node.getAttribute?.("role"),
			        textFromNode(node)
			      ].join(" ");
			      if (!PHOTO_ATTACHMENT_RE.test(fingerprint) && !PHOTO_OPEN_ACTION_RE.test(fingerprint)) return false;
			      return this.subtreeHasPhotoMedia(node) || Boolean(this.findPhotoOpenControl(node));
			    }

			    subtreeHasPhotoMedia(node) {
			      if (this.isPhotoMediaNode(node)) return true;
			      return Array.from(node.querySelectorAll?.("img") || []).some((image) => this.isPhotoMediaNode(image));
			    }

			    isPhotoMediaNode(node) {
			      if (String(node?.tagName || "").toLowerCase() !== "img") return false;
			      const fingerprint = [
			        node.className,
			        node.getAttribute?.("data-testid"),
			        node.getAttribute?.("aria-label"),
			        node.getAttribute?.("role"),
			        node.alt,
			        node.title,
			        node.currentSrc || node.src || node.getAttribute?.("src")
			      ].join(" ");
			      return PHOTO_ATTACHMENT_RE.test(fingerprint) && !RICH_MESSAGE_IMAGE_RE.test(fingerprint);
			    }

			    isPhotoControlNode(node) {
			      if (!node || node.nodeType !== 1) return false;
			      const fingerprint = [
			        textFromNode(node),
			        node.className,
			        node.getAttribute?.("aria-label"),
			        node.getAttribute?.("title"),
			        node.getAttribute?.("role")
			      ].join(" ");
			      return PHOTO_OPEN_ACTION_RE.test(fingerprint);
			    }

			    findPhotoOpenControl(container) {
			      const candidates = Array.from(container.querySelectorAll?.("a, button, [role='button'], div, span") || []);
			      const isInteractive = (node) => {
			        const tag = String(node?.tagName || "").toLowerCase();
			        return tag === "a" || tag === "button" || /button/i.test(node?.getAttribute?.("role") || "");
			      };
			      const controls = [
			        ...candidates.filter(isInteractive),
			        ...candidates.filter((node) => !isInteractive(node)),
			        container
			      ];
			      return controls.find((control) => this.isPhotoControlNode(control)) ||
			        this.firstPhotoMediaNode(container);
			    }

			    firstPhotoMediaNode(container) {
			      if (this.isPhotoMediaNode(container)) return container;
			      return Array.from(container.querySelectorAll?.("img") || []).find((image) => this.isPhotoMediaNode(image)) || null;
			    }

			    photoPreviewUrl(container) {
			      const image = this.firstPhotoMediaNode(container);
			      return normalizeImageSrc(image?.currentSrc || image?.src || image?.getAttribute?.("src"));
			    }

			    classifyPhotoAttachmentState(container) {
			      const text = `${textFromNode(container)} ${container?.className || ""} ${container?.getAttribute?.("aria-label") || ""}`.toLowerCase();
			      if (/unopened|not\s+opened|unread|new\s+photo/.test(text)) return "unopened";
			      if (/opened|viewed|read/.test(text)) return "opened";
			      return "unknown";
			    }

			    openAttachment(chatId, messageId, attachmentId) {
			      const chat = this.chats.get(chatId);
			      if (!chat?.root?.isConnected) return { ok: false, error: "Chat root unavailable" };
			      const action = this.resolveAttachmentAction(chat.root, chatId, messageId, attachmentId);
			      if (!action?.isConnected) return { ok: false, error: "Photo action unavailable" };
			      this.activateNativeAction(action, { singleClick: true });
			      this.scan();
			      return { ok: true };
			    }

			    resolveAttachmentAction(root, chatId, messageId, attachmentId) {
			      const nodes = Array.from(this.findMessageNodes(root));
			      for (let index = 0; index < nodes.length; index += 1) {
			        const parsed = this.parseMessageNode(nodes[index], chatId, index);
			        if (this.messageIdForParsed(chatId, index, parsed) !== messageId) continue;
			        const containers = this.findPhotoAttachmentContainers(nodes[index]).slice(0, MAX_MESSAGE_ATTACHMENTS);
			        const attachmentIndex = containers.findIndex((_, itemIndex) => `photo-${index}-${itemIndex}` === attachmentId);
			        if (attachmentIndex < 0) continue;
			        return this.findPhotoOpenControl(containers[attachmentIndex]);
			      }
			      return null;
			    }

			    isUserMessage(text, parts = [], attachments = []) {
			      const value = String(text || "").replace(/\s+/g, " ").trim();
			      const hasRichContent = Array.isArray(parts) && parts.some((part) => part.type === "image");
			      const hasAttachment = Array.isArray(attachments) && attachments.length > 0;
			      if ((!value && !hasRichContent && !hasAttachment) || value.length > 1000) return false;
			      if (value.length < 2 && !hasRichContent && !hasAttachment) return false;
		      if (/^new$/i.test(value)) return false;
		      if (/^private conversation with\b/i.test(value)) return false;
	      if (/^caution:\s*the chaturbate team will never contact you/i.test(value)) return false;
	      if (/^loading more messages$/i.test(value)) return false;
	      if (/^\(ctrl\+l to close\)$/i.test(value)) return false;
	      if (/^back\s+\(ctrl\+l to close\)$/i.test(value)) return false;
	      return true;
	    }

	    detectSelfName() {
	      const pathMatch = window.location?.pathname?.match(/\/b\/([^/]+)/i);
	      if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);
	      const profileLink = Array.from(document.querySelectorAll("a[href*='/b/']")).find((link) => {
	        const text = textFromNode(link);
	        return text && text.length <= 40;
	      });
	      return textFromNode(profileLink);
	    }

	    detectRoomName() {
	      const parts = String(window.location?.pathname || "")
	        .split("/")
	        .map((part) => part.trim())
	        .filter(Boolean);
	      if (!parts.length) return "";
	      if (parts[0] === "p" && parts[1]) return normalizeId(decodeURIComponent(parts[1]));
	      if (CHATURBATE_NON_ROOM_PATHS.has(parts[0])) return "";
	      return normalizeId(decodeURIComponent(parts[0]));
	    }

    sendMessage(chatId, text) {
      const chat = this.chats.get(chatId);
      if (!chat || !text.trim()) return false;

      if (!chat.root) {
        return false;
      }

	      const input = chat.root.querySelector(CHATURBATE_PM_INPUT_SELECTOR);
      if (!input) return false;

      input.focus();
      if (input.isContentEditable) {
        input.textContent = text.trim();
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text.trim() }));
      } else {
        input.value = text.trim();
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }

	      const sendButton = chat.root.querySelector(CHATURBATE_PM_SEND_SELECTOR);

      if (sendButton) {
        sendButton.click();
        return true;
      }

      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
      return true;
    }

	    async getEmoticonSuggestions(chatId, query) {
	      const needle = String(query || "").toLowerCase();
	      if (!needle) return [];
	      const chat = this.chats.get(chatId);
	      const roots = this.findVisibleEmoticonSuggestionRoots(chat?.root);
	      const liveSuggestions = roots.flatMap((root) => this.extractEmoticonSuggestions(root, ""));
	      if (liveSuggestions.length) {
	        this.emoticonSuggestionCache = this.dedupeSuggestions([
	          ...liveSuggestions,
	          ...this.emoticonSuggestionCache
	        ]).slice(0, 300);
	      }
	      const apiSuggestions = await this.fetchEmoticonSuggestions(needle);
	      return this.dedupeSuggestions([
	        ...apiSuggestions,
	        ...this.filterSuggestions(liveSuggestions, needle),
	        ...this.filterSuggestions(this.emoticonSuggestionCache, needle)
	      ]).slice(0, 20);
	    }

	    async fetchEmoticonSuggestions(needle) {
	      const query = String(needle || "").trim().toLowerCase();
	      if (!query) return [];
	      const cacheKey = `${this.roomName || ""}:${query}`;
	      if (this.emoticonApiCache.has(cacheKey)) return this.emoticonApiCache.get(cacheKey);

	      const startedAt = Date.now();
	      try {
	        const params = new URLSearchParams({ slug: query, room: this.roomName || "" });
	        const response = await fetch(`${CHATURBATE_EMOTICON_AUTOCOMPLETE_ENDPOINT}?${params}`, {
	          credentials: "include"
	        });
	        if (!response?.ok) {
	          this.setEmoticonSourceDebug("chaturbate-api", Number(response?.status) || 0, 0, startedAt);
	          this.emoticonApiCache.set(cacheKey, []);
	          return [];
	        }
	        const payload = await response.json();
	        const suggestions = Array.isArray(payload?.emoticons)
	          ? this.dedupeSuggestions(payload.emoticons.map((item) => this.parseApiEmoticonSuggestion(item)))
	              .filter((item) => item.shortcut)
	              .slice(0, 30)
	          : [];
	        if (suggestions.length) {
	          this.emoticonSuggestionCache = this.dedupeSuggestions([
	            ...suggestions,
	            ...this.emoticonSuggestionCache
	          ]).slice(0, 300);
	        }
	        this.setEmoticonSourceDebug("chaturbate-api", Number(response.status) || 200, suggestions.length, startedAt);
	        this.emoticonApiCache.set(cacheKey, suggestions);
	        return suggestions;
	      } catch (error) {
	        if (window.CB_MULTICHAT_DEBUG) {
	          console.warn("[KKMA PM+] emoticon API unavailable", error);
	        }
	        this.setEmoticonSourceDebug("chaturbate-api", 0, 0, startedAt);
	        this.emoticonApiCache.set(cacheKey, []);
	        return [];
	      }
	    }

	    setEmoticonSourceDebug(kind, status, count, startedAt) {
	      this.debug.emoticonSource = {
	        kind,
	        status,
	        count,
	        latencyMs: Math.max(0, Date.now() - startedAt)
	      };
	    }

	    findVisibleEmoticonSuggestionRoots(pmRoot) {
	      const candidates = Array.from(document.querySelectorAll(CHATURBATE_EMOTICON_POPUP_SELECTOR))
	        .filter((node) => node instanceof HTMLElement)
	        .filter((node) => !pmRoot || !node.contains(pmRoot))
	        .filter((node) => {
	          const rect = node.getBoundingClientRect?.();
	          if (!rect || rect.width < 40 || rect.height < 20) return false;
	          if (rect.width > 900 || rect.height > 700) return false;
	          const style = window.getComputedStyle?.(node);
	          if (style && (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0)) return false;
	          return true;
	        });
	      return candidates.slice(0, 6);
	    }

	    extractEmoticonSuggestions(root, needle) {
	      return Array.from(root.querySelectorAll(CHATURBATE_EMOTICON_ITEM_SELECTOR))
	        .map((node) => this.parseEmoticonSuggestion(node))
	        .filter((item) => item.shortcut)
	        .filter((item) => !needle || item.shortcut.slice(1).toLowerCase().startsWith(needle))
	        .slice(0, 30);
	    }

	    parseEmoticonSuggestion(node) {
	      const text = textFromNode(node);
	      const title = node.getAttribute?.("title") || node.getAttribute?.("aria-label") || "";
	      const dataShortcut = node.getAttribute?.("data-shortcut") || node.getAttribute?.("data-emoticon") || "";
	      const source = `${dataShortcut} ${title} ${text}`;
	      const match = source.match(/:([a-z0-9_-]{1,40})/i) || source.match(/\b([a-z0-9_-]{2,40})\b/);
	      if (!match) return { shortcut: "", label: "" };
	      const shortcut = `:${match[1]}`;
	      const image = node.querySelector?.("img");
	      return {
	        shortcut,
	        label: title || text || shortcut,
	        previewUrl: image?.currentSrc || image?.src || "",
	        source: "chaturbate-dom"
	      };
	    }

	    parseApiEmoticonSuggestion(item) {
	      const slug = String(item?.slug || "").trim();
	      if (!/^[a-z0-9_-]{1,40}$/i.test(slug)) return { shortcut: "", label: "" };
	      return {
	        shortcut: `:${slug}`,
	        label: slug,
	        previewUrl: String(item?.url || ""),
	        width: Number(item?.width) || undefined,
	        height: Number(item?.height) || undefined,
	        source: "chaturbate-api"
	      };
	    }

	    dedupeSuggestions(suggestions) {
	      const seen = new Set();
	      return suggestions.filter((item) => {
	        const key = item.shortcut.toLowerCase();
	        if (seen.has(key)) return false;
	        seen.add(key);
	        return true;
	      });
	    }

	    filterSuggestions(suggestions, needle) {
	      return suggestions.filter((item) => item.shortcut.slice(1).toLowerCase().startsWith(needle));
	    }
  }

  function createAdapter() {
    if (document.querySelector(DEMO_CHAT_SELECTOR)) return new DemoAdapter();
    return new ChaturbateDomAdapter();
  }

	  window.CBMultichatAdapter = {
	    createAdapter,
	    GENERIC_PM_ROOT_SELECTORS,
	    CHATURBATE_PM_ROOT_SELECTOR,
	    CHATURBATE_PM_INPUT_SELECTOR,
	    CHATURBATE_PM_SEND_SELECTOR,
	    CHATURBATE_EMOTICON_POPUP_SELECTOR
	  };
})();
