import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const projectRoot = path.resolve(import.meta.dirname, "..");
const adapterPath = path.join(projectRoot, "src", "chaturbate-adapter.js");

class FakeElement {
  constructor({ tagName = "div", className = "", textContent = "", children = [] } = {}) {
    this.tagName = tagName.toUpperCase();
    this.className = className;
    this.textContent = textContent;
    this.children = children;
    this.parentElement = null;
    this.isConnected = true;
    this.isContentEditable = className.includes("customInput");
    this.clicked = false;
    this.dispatchedEvents = [];
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
    return "";
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
    if (selector.includes("theatermodeInputFieldPm") || selector.includes("contenteditable")) {
      return all.filter((node) => node.className.includes("theatermodeInputFieldPm"));
    }
    if (selector.includes("SendButton")) {
      return all.filter((node) => node.className.includes("SendButton"));
    }
    if (selector.includes(".modalItem")) {
      return all.filter((node) => node.className.includes("modalItem"));
    }
    if (selector.includes(".tag-text")) {
      return all.filter((node) => node.className.includes("tag-text"));
    }
    if (selector.includes("autocomplete")) {
      return all.filter((node) => node.className.includes("autocomplete"));
    }
    if (selector.includes(".msg-text")) {
      return all.filter((node) => node.className.includes("msg-text"));
    }
    if (selector.includes(".message-list")) {
      return all.filter((node) => node.className.includes("message-list"));
    }
    return [];
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
const messageList = new FakeElement({
  className: "msg-list-fvm message-list",
  children: [message, ownMessage, systemMessage, loadingMessage]
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
assert.equal(chat.messages.length, 2);
assert.equal(chat.messages[0].text, "hello from PM");
assert.equal(chat.messages[0].direction, "in");
assert.equal(chat.messages[0].from, "unsaid8935");
assert.equal(chat.messages[1].text, "Bless you");
assert.equal(chat.messages[1].direction, "out");
assert.equal(chat.messages[1].from, "evervessi");

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
