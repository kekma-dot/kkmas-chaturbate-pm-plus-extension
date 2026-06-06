import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const projectRoot = path.resolve(import.meta.dirname, "..");
const diagnosticsPath = path.join(projectRoot, "src", "diagnostics.js");

class FakeNode {
  constructor({
    tagName = "div",
    id = "",
    className = "",
    textContent = "",
    attrs = {},
    rect = { width: 320, height: 220, top: 10, left: 20 },
    children = []
  } = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.textContent = textContent;
    this.attrs = attrs;
    this.children = children;
    this.childElementCount = children.length;
    this._rect = rect;
    this.children.forEach((child) => {
      child.parentElement = this;
    });
  }

  getAttribute(name) {
    if (name === "id") return this.id || null;
    if (name === "class") return this.className || null;
    return this.attrs[name] ?? null;
  }

  getBoundingClientRect() {
    return {
      width: this._rect.width,
      height: this._rect.height,
      top: this._rect.top,
      left: this._rect.left
    };
  }

  querySelectorAll(selector) {
    const descendants = [];
    const visit = (node) => {
      node.children.forEach((child) => {
        descendants.push(child);
        visit(child);
      });
    };
    visit(this);

    if (selector.includes("a, button")) {
      return descendants.filter((child) => ["A", "BUTTON", "DIV", "SPAN"].includes(child.tagName));
    }
    if (selector.includes("textarea")) {
      return descendants.filter((child) => child.tagName === "TEXTAREA" || child.tagName === "INPUT");
    }
    if (selector.includes("message") || selector.includes("msg")) {
      return descendants.filter((child) => /message|msg/i.test(child.className));
    }
    if (selector.includes("img")) {
      return descendants.filter((child) => child.tagName === "IMG");
    }
    if (selector.includes("photo") || selector.includes("image") || selector.includes("media") || selector.includes("attachment")) {
      return descendants.filter((child) => /photo|image|media|attachment/i.test(child.className));
    }
    if (selector.includes("emoticon") || selector.includes("autocomplete") || selector.includes("suggest")) {
      return descendants.filter((child) => /emoticon|autocomplete|suggest/i.test(child.className));
    }
    return [];
  }
}

const privateAction = new FakeNode({
  tagName: "div",
  className: "action-row",
  textContent: "Send private message"
});
const messageNode = new FakeNode({
  tagName: "p",
  className: "private-message-text",
  textContent: "come touch my feet private note"
});
const inputNode = new FakeNode({
  tagName: "textarea",
  className: "pm-compose-input",
  attrs: { type: "text" }
});
const pmPhotoImage = new FakeNode({
  tagName: "img",
  className: "pm-photo-thumbnail",
  attrs: {
    src: "https://media-secret.chaturbate.test/private/raw-member-photo.jpg?token=super-secret",
    href: "https://media-secret.chaturbate.test/private/full-size.jpg"
  },
  rect: { width: 96, height: 80, top: 88, left: 36 }
});
const pmPhotoButton = new FakeNode({
  tagName: "button",
  className: "pm-photo-open-control",
  textContent: "Open photo"
});
const pmPhotoNode = new FakeNode({
  tagName: "div",
  className: "private-message-row photo-attachment unopened-media",
  textContent: "secret-user-label sent private photo Unopened",
  children: [pmPhotoImage, pmPhotoButton]
});
const pmRoot = new FakeNode({
  tagName: "section",
  id: "pm-unsaid8935-secret",
  className: "private-message-panel pm-root",
  textContent: "unsaid8935 Send private message come touch my feet private note",
  children: [privateAction, messageNode, pmPhotoNode, inputNode]
});
const pageImage = new FakeNode({
  tagName: "img",
  className: "broadcast-image outside-pm",
  attrs: {
    src: "https://outside.example/leak-me.jpg"
  }
});
const emoticonOption = new FakeNode({
  tagName: "button",
  className: "emoticon-suggestion-row",
  textContent: ":heart secret-user-label"
});
const emoticonPopup = new FakeNode({
  tagName: "div",
  className: "emoticon-autocomplete-popup",
  textContent: ":heart secret-user-label",
  rect: { width: 240, height: 120, top: 420, left: 640 },
  children: [emoticonOption]
});

const fakeDocument = {
  title: "Secret room title",
  location: { host: "chaturbate.test", pathname: "/broadcast/private" },
  querySelectorAll(selector) {
    if (selector.includes("emoticon") || selector.includes("autocomplete") || selector.includes("suggest")) return [emoticonPopup];
    if (selector.includes("private") || selector.includes("pm")) return [pmRoot];
    if (selector.includes("img")) return [pageImage];
    return [];
  }
};

const context = {
  window: {},
  document: fakeDocument,
  console,
  navigator: {},
  crypto: undefined,
  URL,
  setTimeout,
  clearTimeout
};
context.globalThis = context.window;
context.window.document = fakeDocument;
context.window.console = console;
context.window.navigator = context.navigator;
context.window.CBMultichatNetworkProbeDiagnostics = {
  snapshot: () => ({
    enabledForCurrentPage: true,
    enabledForNextReload: true,
    injected: true,
    lateAttach: false,
    eventCount: 1,
    lastEventAt: 123,
    errorKind: "other",
    events: [
      {
        kind: "websocket",
        phase: "message",
        direction: "in",
        method: "POST",
        url: {
          kind: "same-origin",
          scheme: "wss",
          hostHash: "h123safe",
          pathHash: "h456safe",
          raw: "wss://chaturbate.com/ws?token=super-secret"
        },
        payload: {
          kind: "object",
          size: 72,
          truncated: false,
          topLevelKeyKinds: ["message", "user", "secret", "raw-secret-key"],
          hasMessageText: true,
          hasThreadId: true,
          hasUsername: true,
          hasSecretKey: true,
          rawText: "come touch my feet private note",
          username: "unsaid8935"
        },
        rawMessage: "come touch my feet private note"
      }
    ]
  })
};

const source = fs.readFileSync(diagnosticsPath, "utf8");
vm.runInNewContext(source, context, { filename: diagnosticsPath });

const diagnostics = context.window.CBMultichatDiagnostics.collect({ root: fakeDocument });
const serialized = JSON.stringify(diagnostics);
const text = context.window.CBMultichatDiagnostics.diagnosticsText({ root: fakeDocument });

assert.equal(diagnostics.version, 1);
assert.equal(diagnostics.candidates.length, 1);
assert.equal(diagnostics.networkProbe.enabledForCurrentPage, true);
assert.equal(diagnostics.networkProbe.events.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(diagnostics.networkProbe.events[0].payload.topLevelKeyKinds)), ["message", "user", "secret", "other"]);
assert.equal(diagnostics.candidates[0].tag, "section");
assert.equal(diagnostics.candidates[0].controls[0].textKind, "send-private-message");
assert.equal(diagnostics.candidates[0].inputs.length, 1);
assert.equal(diagnostics.candidates[0].messageLikeCount, 2);
assert.equal(diagnostics.mediaCandidates.length, 1);
assert.equal(diagnostics.mediaCandidates[0].statusKind, "unopened");
assert.equal(diagnostics.mediaCandidates[0].imageCount, 1);
assert.equal(diagnostics.mediaCandidates[0].imageHostHashes.length, 1);
assert.equal(typeof diagnostics.mediaCandidates[0].imageHostHashes[0], "string");
assert(diagnostics.mediaCandidates[0].imageHostHashes[0].startsWith("h"));
assert.equal(diagnostics.mediaCandidates[0].controls[0].textKind, "open-photo");
assert.equal(diagnostics.emoticonPopups.length, 1);
assert.equal(diagnostics.emoticonPopups[0].itemCount, 1);
assert.deepEqual(JSON.parse(JSON.stringify(diagnostics.emoticonPopups[0].rect)), { width: 240, height: 120, top: 420, left: 640 });

assert(!serialized.includes("come touch my feet"), "diagnostics must not include message text");
assert(!serialized.includes("private note"), "diagnostics must not include private message text");
assert(!serialized.includes("unsaid8935"), "diagnostics must not include raw usernames from ids or text");
assert(!serialized.includes("secret-user-label"), "emoticon diagnostics must not include raw surrounding text");
assert(!serialized.includes("media-secret.chaturbate.test"), "media diagnostics must not include raw media host");
assert(!serialized.includes("raw-member-photo"), "media diagnostics must not include raw image src");
assert(!serialized.includes("full-size"), "media diagnostics must not include raw href");
assert(!serialized.includes("super-secret"), "media diagnostics must not include URL tokens");
assert(!serialized.includes("outside.example"), "media diagnostics must stay scoped to PM roots");
assert(!serialized.includes("Secret room title"), "diagnostics must not include document title");
assert(!serialized.includes("raw-secret-key"), "network diagnostics must not include unknown raw key strings");
assert(!serialized.includes("rawMessage"), "network diagnostics must not include unknown raw event fields");
assert.equal(typeof text, "string");
assert(text.includes("\"version\": 1"));
assert(!text.includes("come touch my feet"), "diagnostics text must not include message text");

console.log("diagnostics-unit ok");
