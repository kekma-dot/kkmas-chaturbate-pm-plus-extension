(function () {
  const VERSION = 1;
  const MAX_MESSAGE_PARTS = 24;
  const MAX_MESSAGE_ATTACHMENTS = 4;

  function createChatStore() {
    const chats = new Map();
    let activeChatId = null;

    function upsertChat(input = {}) {
      const chatId = normalizeId(input.chatId || input.username || input.threadId);
      if (!chatId) return null;

      const previous = chats.get(chatId);
      const chat = previous || {
        chatId,
        username: "",
        title: "",
        threadId: "",
        nativeRootId: "",
        messages: [],
        unread: 0,
        lastSeenAt: 0,
        sources: [],
        errors: []
      };

      if (input.username !== undefined) chat.username = String(input.username || "");
      if (input.title !== undefined) chat.title = String(input.title || "");
      if (input.threadId !== undefined) chat.threadId = String(input.threadId || "");
      if (input.nativeRootId !== undefined || input.bindingId !== undefined) {
        chat.nativeRootId = String(input.nativeRootId || input.bindingId || "");
      }
      chats.set(chatId, chat);
      if (Array.isArray(input.errors)) {
        chat.errors = unique(chat.errors.concat(input.errors.map((error) => String(error || ""))));
      }
      mergeSources(chatId, input.sources || input.source || []);
      return cloneChat(chat);
    }

    function appendMessages(chatIdInput, messages = []) {
      const chatId = normalizeId(chatIdInput);
      if (!chatId || !Array.isArray(messages) || messages.length === 0) return [];

      const chat = chats.get(chatId) || upsertInternal({ chatId });
      const existingKeys = new Set(chat.messages.map(messageKey));
      const added = [];

      messages.forEach((input) => {
        const message = normalizeMessage(input);
        if (!message) return;
        const key = messageKey(message);
        if (existingKeys.has(key)) {
          const existing = chat.messages.find((item) => messageKey(item) === key);
          if (existing && message.source) mergeMessageSource(existing, message.source);
          if (message.source) mergeSources(chatId, message.source);
          return;
        }

        existingKeys.add(key);
        chat.messages.push(message);
        added.push(message);
        if (message.source) mergeSources(chatId, message.source);
      });

      chat.messages.sort((a, b) => {
        const left = Number(a.ts) || 0;
        const right = Number(b.ts) || 0;
        if (left !== right) return left - right;
        return String(a.messageId || "").localeCompare(String(b.messageId || ""));
      });

      if (activeChatId !== chatId) {
        chat.unread += added.length;
      } else if (added.length > 0) {
        markRead(chatId);
      }

      return added.map(cloneMessage);
    }

    function markRead(chatIdInput, seenAt = Date.now()) {
      const chat = chats.get(normalizeId(chatIdInput));
      if (!chat) return null;
      chat.unread = 0;
      chat.lastSeenAt = Number(seenAt) || Date.now();
      return cloneChat(chat);
    }

    function bindNativeRoot(chatIdInput, bindingId) {
      const chat = chats.get(normalizeId(chatIdInput)) || upsertInternal({ chatId: chatIdInput });
      chat.nativeRootId = String(bindingId || "");
      return cloneChat(chat);
    }

    function setActiveChat(chatIdInput) {
      activeChatId = normalizeId(chatIdInput);
      if (activeChatId) markRead(activeChatId);
      return activeChatId;
    }

    function mergeSources(chatIdInput, sources) {
      const chat = chats.get(normalizeId(chatIdInput)) || upsertInternal({ chatId: chatIdInput });
      const nextSources = Array.isArray(sources) ? sources : [sources];
      chat.sources = unique(chat.sources.concat(nextSources.map((source) => String(source || "")).filter(Boolean)));
      return cloneChat(chat);
    }

    function getChat(chatIdInput) {
      const chat = chats.get(normalizeId(chatIdInput));
      return chat ? cloneChat(chat) : null;
    }

    function getChats() {
      return Array.from(chats.values()).map(cloneChat);
    }

    function snapshot() {
      return {
        version: VERSION,
        activeChatId,
        chats: getChats()
      };
    }

    function upsertInternal(input) {
      const chatId = normalizeId(input.chatId || input.username || input.threadId);
      const chat = {
        chatId,
        username: "",
        title: "",
        threadId: "",
        nativeRootId: "",
        messages: [],
        unread: 0,
        lastSeenAt: 0,
        sources: [],
        errors: []
      };
      chats.set(chatId, chat);
      return chat;
    }

    return {
      upsertChat,
      appendMessages,
      markRead,
      bindNativeRoot,
      setActiveChat,
      mergeSources,
      getChat,
      getChats,
      snapshot
    };
  }

  function normalizeMessage(input = {}) {
    if (!input || typeof input !== "object") return null;
    const parts = normalizeParts(input.parts);
    const attachments = normalizeAttachments(input.attachments);
    const text = input.text === undefined ? textFromParts(parts) : String(input.text || textFromParts(parts));
    const messageId = input.messageId === undefined ? "" : String(input.messageId);
    if (!text && !messageId && parts.length === 0 && attachments.length === 0) return null;

    return {
      messageId,
      direction: input.direction === "out" ? "out" : "in",
      text,
      parts: parts.length ? parts : normalizeParts([{ type: "text", text }]),
      attachments,
      ts: Number(input.ts) || 0,
      source: String(input.source || ""),
      rawKind: String(input.rawKind || ""),
      sources: input.source ? [String(input.source)] : []
    };
  }

  function messageKey(message) {
    if (message.messageId) return `id:${message.messageId}`;
    return [
      "sig",
      message.direction || "",
      message.text || "",
      partsKey(message.parts),
      attachmentsKey(message.attachments),
      Number(message.ts) || 0,
      message.rawKind || ""
    ].join("|");
  }

  function normalizeParts(input) {
    if (!Array.isArray(input)) return [];
    const parts = [];
    input.forEach((part) => {
      if (!part || parts.length >= MAX_MESSAGE_PARTS) return;
      if (part.type === "image") {
        const src = normalizeImageSrc(part.src);
        if (!src) return;
        parts.push({
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
      const text = normalizePartText(part.text);
      if (text) parts.push({ type: "text", text });
    });
    return parts;
  }

  function textFromParts(parts) {
    return (parts || [])
      .map((part) => part.type === "image" ? part.alt || part.title || "" : part.text || "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  }

  function partsKey(parts) {
    return (parts || [])
      .map((part) => part.type === "image" ? `${part.kind}:${part.alt || part.title || ""}:${part.src || ""}` : part.text || "")
      .join("");
  }

  function normalizeAttachments(input) {
    if (!Array.isArray(input)) return [];
    const attachments = [];
    input.forEach((attachment) => {
      if (!attachment || attachments.length >= MAX_MESSAGE_ATTACHMENTS) return;
      if (attachment.type !== "photo") return;
      const id = normalizePartText(attachment.id, 80);
      if (!id) return;
      const state = ["unopened", "opened", "unknown"].includes(attachment.state) ? attachment.state : "unknown";
      attachments.push({
        id,
        type: "photo",
        state,
        previewPolicy: attachment.previewPolicy === "visible-thumbnail" ? "visible-thumbnail" : "none",
        previewUrl: "",
        previewIsBlurred: attachment.previewIsBlurred === true || attachment.previewIsBlurred === false
          ? attachment.previewIsBlurred
          : "unknown",
        actionKind: attachment.actionKind === "open-photo" ? "open-photo" : "",
        nativeActionKey: normalizePartText(attachment.nativeActionKey, 120)
      });
    });
    return attachments;
  }

  function attachmentsKey(attachments) {
    return (attachments || [])
      .map((attachment) => `${attachment.type}:${attachment.id}:${attachment.state}:${attachment.actionKind}`)
      .join("");
  }

  function normalizePartText(value, maxLength = 500) {
    return String(value || "").replace(/\s+/g, " ").slice(0, maxLength);
  }

  function normalizeImageSrc(value) {
    const src = String(value || "").trim();
    if (!src) return "";
    if (/^https?:\/\//i.test(src) || src.startsWith("data:image/")) return src.slice(0, 500);
    if (src.startsWith("//")) return `https:${src}`.slice(0, 500);
    return "";
  }

  function clampImageSize(value) {
    const number = Number(value) || 0;
    if (!number) return 0;
    return Math.max(1, Math.min(128, Math.round(number)));
  }

  function mergeMessageSource(message, source) {
    const sources = Array.isArray(message.sources) ? message.sources : [];
    message.sources = unique(sources.concat(String(source || "")).filter(Boolean));
  }

  function normalizeId(value) {
    return String(value || "").trim();
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function cloneChat(chat) {
    return {
      chatId: chat.chatId,
      username: chat.username,
      title: chat.title,
      threadId: chat.threadId,
      nativeRootId: chat.nativeRootId,
      messages: chat.messages.map(cloneMessage),
      unread: chat.unread,
      lastSeenAt: chat.lastSeenAt,
      sources: chat.sources.slice(),
      errors: chat.errors.slice()
    };
  }

  function cloneMessage(message) {
    return {
      messageId: message.messageId,
      direction: message.direction,
      text: message.text,
      parts: normalizeParts(message.parts),
      attachments: normalizeAttachments(message.attachments),
      ts: message.ts,
      source: message.source,
      rawKind: message.rawKind,
      sources: Array.isArray(message.sources) ? message.sources.slice() : []
    };
  }

  window.CBMultichatStore = {
    createChatStore,
    VERSION
  };
})();
