import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const projectRoot = path.resolve(import.meta.dirname, "..");
const adapterPath = path.join(projectRoot, "src", "chaturbate-adapter.js");

class FakeElement {
  constructor({ tagName = "div", className = "", textContent = "", children = [], attributes = {} } = {}) {
    this.tagName = tagName.toUpperCase();
    this.className = className;
    this.nodeType = 1;
    this.textContent = textContent;
    this.children = children;
    this.childNodes = children;
    this.attributes = { ...attributes };
    this.parentElement = null;
    this.isConnected = true;
    this.isContentEditable = className.includes("customInput");
    this.clicked = false;
    this.dispatchedEvents = [];
    this.src = attributes.src || "";
    this.currentSrc = attributes.currentSrc || attributes.src || "";
    this.alt = attributes.alt || "";
    this.title = attributes.title || "";
    this.width = Number(attributes.width) || 0;
    this.height = Number(attributes.height) || 0;
    children.forEach((child) => {
      child.parentElement = this;
    });
    this.classList = {
      contains: (token) => this.className.split(/\s+/).includes(token)
    };
  }

  get childElementCount() {
    return this.children.length;
  }

  getAttribute(name) {
    if (name === "class") return this.className;
    if (name === "type") return this.type || "";
    return this.attributes[name] || "";
  }

  getBoundingClientRect() {
    return { width: 530, height: 560, top: 250, left: 600 };
  }

  focus() {
    this.focused = true;
  }

  click() {
    this.clicked = true;
    if (this.onClick) this.onClick();
  }

  dispatchEvent(event) {
    this.lastEvent = event.type;
    this.dispatchedEvents.push(event.type);
    if (event.type === "click" && this.onClick) this.onClick();
    return true;
  }

  contains(node) {
    if (node === this) return true;
    return flatten(this.children).includes(node);
  }

  closest(selector) {
    if (selector === ".ChatTabContents") {
      let current = this;
      while (current) {
        if (current.className.includes("ChatTabContents")) return current;
        current = current.parentElement;
      }
    }
    if (selector === ".msg-text") {
      let current = this;
      while (current) {
        if (current.className.includes("msg-text")) return current;
        current = current.parentElement;
      }
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const all = flatten(this.children);
    if (selector.includes("a, button")) {
      return all.filter((node) => ["A", "BUTTON", "DIV", "SPAN"].includes(node.tagName));
    }
    if (selector.includes("img")) {
      return all.filter((node) => node.tagName === "IMG");
    }
    if (selector.includes("theatermodeInputFieldPm") || selector.includes("contenteditable")) {
      return all.filter((node) => String(node.className || "").includes("theatermodeInputFieldPm"));
    }
    if (selector.includes("SendButton")) {
      return all.filter((node) => String(node.className || "").includes("SendButton"));
    }
    if (selector.includes(".modalItem")) {
      return all.filter((node) => String(node.className || "").includes("modalItem"));
    }
    if (selector.includes(".tag-text")) {
      return all.filter((node) => String(node.className || "").includes("tag-text"));
    }
    if (selector.includes("autocomplete")) {
      return all.filter((node) => String(node.className || "").includes("autocomplete"));
    }
    if (selector.includes(".msg-text")) {
      return all.filter((node) => String(node.className || "").includes("msg-text"));
    }
    if (selector.includes(".message-list")) {
      return all.filter((node) => String(node.className || "").includes("message-list"));
    }
    return [];
  }
}

class FakeText {
  constructor(text) {
    this.nodeType = 3;
    this.nodeValue = text;
    this.textContent = text;
    this.children = [];
    this.childNodes = [];
    this.parentElement = null;
  }
}

function createJsonResponse(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "application/json" : "";
      }
    },
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

function flatten(nodes) {
  return nodes.flatMap((node) => [node, ...flatten(node.children || [])]);
}

let pmAvailable = false;
let dmAvailable = false;
let fetchMode = "success";
const fetchCalls = [];
const directAction = new FakeElement({ tagName: "div", textContent: "Send direct message" });
directAction.onClick = () => {
  dmAvailable = true;
};
const nativeAction = new FakeElement({ tagName: "div", textContent: "Send private message" });
nativeAction.onClick = () => {
  pmAvailable = true;
};
const sourcePopover = new FakeElement({ children: [directAction, nativeAction] });
const input = new FakeElement({
  className: "customInput noScrollbar chat-input-field inputFieldChatPlaceholder theatermodeInputFieldPm"
});
const sendButton = new FakeElement({
  tagName: "button",
  className: "Button SendButton SplitMode pm"
});
sendButton.type = "button";
const messageText = new FakeElement({
  className: "msg-text dm-adjust",
  textContent: "hello from PM"
});
const ownMessageText = new FakeElement({
  className: "msg-text dm-adjust",
  textContent: "Bless you"
});
const systemMessageText = new FakeElement({
  className: "msg-text dm-adjust",
  textContent: "Private conversation with deniscreateCaution: The Chaturbate Team will NEVER contact you via chat or ask for your password."
});
const loadingMessageText = new FakeElement({
  className: "msg-text dm-adjust",
  textContent: "Loading More Messages"
});
const emoticonImage = new FakeElement({
  tagName: "img",
  className: "emoticonImage",
  attributes: {
    src: "https://static-pub.highwebmedia.com/emoticons/hihi.gif",
    alt: ":hihi",
    width: "25",
    height: "25"
  }
});
const emoticonOnlyText = new FakeElement({
  className: "msg-text dm-adjust",
  textContent: ":hihi",
  children: [emoticonImage]
});
const newBadge = new FakeElement({
  tagName: "span",
  className: "new-message-badge",
  textContent: "New",
  children: [new FakeText("New")]
});
const roseEmoji = new FakeElement({
  tagName: "img",
  className: "emoji",
  attributes: {
    src: "https://static-pub.highwebmedia.com/emoji/rose.png",
    alt: "\u{1F339}",
    width: "18",
    height: "18"
  }
});
const emojiMessageText = new FakeElement({
  className: "msg-text dm-adjust",
  textContent: "NewFor you \u{1F339}",
  children: [newBadge, new FakeText("For you "), roseEmoji]
});
const newOnlyText = new FakeElement({
  className: "msg-text dm-adjust",
  textContent: "New",
  children: [new FakeElement({
    tagName: "span",
    className: "new-message-badge",
    textContent: "New",
    children: [new FakeText("New")]
  })]
});
let photoOpenCount = 0;
const photoNewBadge = new FakeElement({
  tagName: "span",
  className: "new-message-badge",
  textContent: "New",
  children: [new FakeText("New")]
});
const photoImage = new FakeElement({
  tagName: "img",
  className: "pm-photo-thumbnail private-media-preview",
  attributes: {
    src: "https://media-secret.chaturbate.test/private/raw-member-photo.jpg?token=super-secret",
    width: "96",
    height: "80"
  }
});
photoImage.onClick = () => {
  photoOpenCount += 1;
};
const photoMessageText = new FakeElement({
  className: "msg-text dm-adjust",
  textContent: "New",
  children: [photoNewBadge, photoImage]
});
const message = new FakeElement({
  className: "msg-row",
  textContent: "unsaid8935hello from PM",
  children: [messageText]
});
const ownMessage = new FakeElement({
  className: "msg-row",
  textContent: "evervessiBless you",
  children: [ownMessageText]
});
const systemMessage = new FakeElement({
  className: "msg-row",
  textContent: "Private conversation with deniscreateCaution: The Chaturbate Team will NEVER contact you via chat or ask for your password.",
  children: [systemMessageText]
});
const loadingMessage = new FakeElement({
  className: "msg-row",
  textContent: "Loading More Messages",
  children: [loadingMessageText]
});
const emoticonOnlyMessage = new FakeElement({
  className: "msg-row",
  textContent: "unsaid8935:hihi",
  children: [emoticonOnlyText]
});
const emojiMessage = new FakeElement({
  className: "msg-row",
  textContent: "unsaid8935NewFor you \u{1F339}",
  children: [emojiMessageText]
});
const photoMessage = new FakeElement({
  className: "msg-row photo-attachment unopened-media",
  textContent: "unsaid8935New",
  children: [photoMessageText]
});
const newOnlyMessage = new FakeElement({
  className: "msg-row",
  textContent: "unsaid8935New",
  children: [newOnlyText]
});
const messageList = new FakeElement({
  className: "msg-list-fvm message-list",
  children: [message, ownMessage, systemMessage, loadingMessage, emoticonOnlyMessage, emojiMessage, photoMessage, newOnlyMessage]
});
const pmRoot = new FakeElement({
  className: "ChatTabContents TheatermodeChatDivPm",
  children: [messageList, input, sendButton]
});
const liveAutocompletePopup = new FakeElement({
  className: "emoticonAutocompleteModal autocompleteModal theatermodeEmoticonAutocompleteModalChat",
  textContent: "HUGHughey_",
  children: [
    new FakeElement({
      className: "autocompleteList",
      textContent: "HUGHughey_",
      children: [
        new FakeElement({
          className: "modalItem",
          textContent: "HUG",
          children: [new FakeElement({ className: "tag-text", textContent: "HUG" })]
        }),
        new FakeElement({
          className: "modalItem",
          textContent: "hey_",
          children: [new FakeElement({ className: "tag-text", textContent: "hey_" })]
        })
      ]
    })
  ]
});

const fakeDocument = {
  body: new FakeElement(),
  querySelector(selector) {
    if (selector === "[data-cbm-chat]") return null;
    return this.querySelectorAll(selector)[0] || null;
  },
  querySelectorAll(selector) {
    if (selector.includes("autocomplete") || selector.includes("emoticon")) return [liveAutocompletePopup];
    if (selector.includes("ChatTabContents") && pmAvailable) return [pmRoot];
    return [];
  }
};

class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
}

class FakeInputEvent {
  constructor(type) {
    this.type = type;
  }
}

const context = {
  window: {},
  document: fakeDocument,
  console,
  EventTarget,
  CustomEvent,
  HTMLElement: FakeElement,
  MutationObserver: FakeMutationObserver,
  MouseEvent: FakeInputEvent,
  PointerEvent: FakeInputEvent,
  InputEvent: FakeInputEvent,
  Event,
  KeyboardEvent: FakeInputEvent,
  setTimeout,
  clearTimeout,
  URLSearchParams,
  fetch: async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });
    if (fetchMode === "error") return createJsonResponse(404, { detail: "not found" });
    return createJsonResponse(200, {
      slug: "hi",
      emoticons: [
        {
          slug: "hihi",
          url: "https://static-pub.highwebmedia.com/uploads/avatar/hihi.jpg",
          width: 25,
          height: 25
        },
        {
          slug: "hii-",
          url: "https://static-pub.highwebmedia.com/uploads/avatar/hii.jpg",
          width: 150,
          height: 80
        }
      ]
    });
  }
};
context.globalThis = context.window;
context.window.document = fakeDocument;
context.window.location = { pathname: "/b/evervessi/" };
context.window.fetch = context.fetch;
context.window.CB_MULTICHAT_DEBUG = false;

const source = fs.readFileSync(adapterPath, "utf8");
vm.runInNewContext(source, context, { filename: adapterPath });

const adapter = context.window.CBMultichatAdapter.createAdapter();
const chat = await adapter.openChatForUser("unsaid8935", sourcePopover);

assert.equal(nativeAction.clicked, true);
assert.equal(directAction.clicked, false);
assert.equal(dmAvailable, false);
assert.deepEqual(nativeAction.dispatchedEvents.slice(0, 4), ["pointerdown", "mousedown", "mouseup", "click"]);
assert.equal(chat.id, "unsaid8935");
assert.equal(chat.root, pmRoot);
assert.equal(chat.messages.length, 5);
assert.equal(chat.messages[0].text, "hello from PM");
assert.equal(chat.messages[0].direction, "in");
assert.equal(chat.messages[0].from, "unsaid8935");
assert.equal(chat.messages[1].text, "Bless you");
assert.equal(chat.messages[1].direction, "out");
assert.equal(chat.messages[1].from, "evervessi");
assert.equal(chat.messages[2].text, ":hihi");
assert.deepEqual(JSON.parse(JSON.stringify(chat.messages[2].parts || null)), [
  {
    type: "image",
    kind: "emoticon",
    src: "https://static-pub.highwebmedia.com/emoticons/hihi.gif",
    alt: ":hihi",
    title: "",
    width: 25,
    height: 25
  }
]);
assert.equal(chat.messages[3].text, "For you \u{1F339}");
assert(!chat.messages[3].text.includes("New"), "service New badge must not become message text");
assert.deepEqual(JSON.parse(JSON.stringify(chat.messages[3].parts || null)), [
  { type: "text", text: "For you " },
  {
    type: "image",
    kind: "emoji",
    src: "https://static-pub.highwebmedia.com/emoji/rose.png",
    alt: "\u{1F339}",
    title: "",
    width: 18,
    height: 18
  }
]);
assert.equal(chat.messages[4].text, "", "photo-only messages must not render service New as text");
assert.deepEqual(JSON.parse(JSON.stringify(chat.messages[4].parts || null)), []);
assert.deepEqual(JSON.parse(JSON.stringify(chat.messages[4].attachments || null)), [
  {
    id: "photo-6-0",
    type: "photo",
    state: "unopened",
    previewPolicy: "visible-thumbnail",
    previewUrl: "https://media-secret.chaturbate.test/private/raw-member-photo.jpg?token=super-secret",
    previewIsBlurred: true,
    actionKind: "open-photo",
    nativeActionKey: "unsaid8935:6:0:open-photo"
  }
]);
assert(!chat.messages[4].attachments[0].id.includes("media-secret"), "photo attachment ids must not expose raw media host");
assert(!chat.messages[4].attachments[0].nativeActionKey.includes("super-secret"), "photo action keys must not expose URL tokens");
const openPhotoResult = adapter.openAttachment(chat.id, chat.messages[4].id, chat.messages[4].attachments[0].id);
assert.deepEqual(JSON.parse(JSON.stringify(openPhotoResult)), { ok: true });
assert.equal(photoOpenCount, 1, "openAttachment must invoke the native photo action exactly once");
assert.equal(fetchCalls.length, 0, "openAttachment must not fetch private media URLs");

const mixedPhotoRow = new FakeElement({
  className: "msg-row photo-attachment unopened-media",
  textContent: "unsaid8935Here is me Open photo",
  children: [new FakeElement({
    className: "msg-text dm-adjust",
    textContent: "Here is me Open photo",
    children: [
      new FakeText("Here is me "),
      new FakeElement({
        tagName: "img",
        className: "pm-photo-thumbnail private-media-preview",
        attributes: {
          src: "https://media-secret.chaturbate.test/private/mixed-photo.jpg?token=super-secret"
        }
      }),
      new FakeElement({
        tagName: "button",
        className: "pm-photo-open-control",
        textContent: "Open photo"
      })
    ]
  })]
});
const mixedParsed = adapter.parseMessageNode(mixedPhotoRow, "unsaid8935", 8);
assert.equal(mixedParsed.text, "Here is me", "text next to PM photo attachments must survive parsing");
assert.equal(mixedParsed.attachments.length, 1);

const ownImageOnlyRow = new FakeElement({
  className: "msg-row",
  textContent: "evervessi",
  children: [new FakeElement({
    className: "msg-text dm-adjust",
    textContent: "",
    children: [new FakeElement({
      tagName: "img",
      className: "emoticonImage",
      attributes: {
        src: "https://static-pub.highwebmedia.com/emoticons/hihi.gif",
        alt: ":hihi",
        width: "25",
        height: "25"
      }
    })]
  })]
});
const ownImageOnlyParsed = adapter.parseMessageNode(ownImageOnlyRow, "unsaid8935", 9);
assert.equal(ownImageOnlyParsed.direction, "out", "own image-only emoticons must keep outgoing direction");
assert.equal(ownImageOnlyParsed.from, "evervessi");

const sent = adapter.sendMessage("unsaid8935", "hello back");
assert.equal(sent, true);
assert.equal(input.textContent, "hello back");
assert.equal(sendButton.clicked, true);

sendButton.clicked = false;
input.textContent = "";
const emoticonSent = adapter.sendMessage("unsaid8935", ":heart");
assert.equal(emoticonSent, true);
assert.equal(input.textContent, ":heart");
assert.equal(sendButton.clicked, true);

const suggestions = await adapter.getEmoticonSuggestions("unsaid8935", "h");
assert(suggestions.some((item) => item.shortcut === ":hey_"));

fetchMode = "success";
fetchCalls.length = 0;
const apiSuggestions = await adapter.getEmoticonSuggestions("unsaid8935", "hi");
assert.deepEqual(JSON.parse(JSON.stringify(apiSuggestions.map((item) => item.shortcut))), [":hihi", ":hii-"]);
assert.equal(apiSuggestions[0].source, "chaturbate-api");
assert.equal(apiSuggestions[0].previewUrl, "https://static-pub.highwebmedia.com/uploads/avatar/hihi.jpg");
assert.equal(apiSuggestions[0].width, 25);
assert.equal(apiSuggestions[0].height, 25);
assert.equal(adapter.debug.emoticonSource.kind, "chaturbate-api");
assert.equal(adapter.debug.emoticonSource.status, 200);
assert.equal(adapter.debug.emoticonSource.count, 2);
assert.equal(typeof adapter.debug.emoticonSource.latencyMs, "number");
assert(!JSON.stringify(adapter.debug.emoticonSource).includes("slug=hi"), "debug must not include raw query URL");
assert(fetchCalls[0].url.includes("/api/ts/emoticons/autocomplete/?"), "must use Chaturbate emoticon autocomplete API");
assert(fetchCalls[0].url.includes("slug=hi"), "must query by slug");
assert.equal(fetchCalls[0].options.credentials, "include");

fetchMode = "error";
adapter.emoticonSuggestionCache = [];
const unavailableSuggestions = await adapter.getEmoticonSuggestions("unsaid8935", "zz");
assert.deepEqual(JSON.parse(JSON.stringify(unavailableSuggestions)), []);

console.log("chaturbate-adapter-unit ok");
