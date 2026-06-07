import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const projectRoot = path.resolve(import.meta.dirname, "..");
const storePath = path.join(projectRoot, "src", "chat-store.js");

const context = {
  window: {},
  console
};
context.globalThis = context.window;

vm.runInNewContext(fs.readFileSync(storePath, "utf8"), context, { filename: storePath });

const store = context.window.CBMultichatStore.createChatStore();

store.upsertChat({
  chatId: "pm:kaepee",
  username: "kaepee",
  title: "kaepee",
  threadId: "thread-1",
  sources: ["dom"]
});
store.bindNativeRoot("pm:kaepee", "native-root-1");
store.appendMessages("pm:kaepee", [
  {
    messageId: "m1",
    direction: "in",
    text: "hello from dom",
    ts: 1000,
    source: "dom"
  },
  {
    messageId: "m1",
    direction: "in",
    text: "hello from network",
    ts: 1000,
    source: "network"
  },
  {
    direction: "out",
    text: "fallback duplicate",
    ts: 1100,
    source: "dom"
  },
  {
    direction: "out",
    text: "fallback duplicate",
    ts: 1100,
    source: "network"
  }
]);

let chat = store.getChat("pm:kaepee");
assert.equal(chat.messages.length, 2, "ChatStore must dedupe message id and fallback duplicate signatures");
assert.deepEqual(JSON.parse(JSON.stringify(chat.sources.sort())), ["dom", "network"]);
assert.equal(chat.nativeRootId, "native-root-1");
assert.equal(Object.prototype.hasOwnProperty.call(chat, "nativeRoot"), false, "ChatStore must not store DOM nodes");
assert.equal(chat.unread, 2);

store.setActiveChat("pm:kaepee");
chat = store.getChat("pm:kaepee");
assert.equal(chat.unread, 0, "active chat must be marked read");
assert.equal(chat.lastSeenAt > 0, true);

store.appendMessages("pm:kaepee", [
  {
    messageId: "m2",
    direction: "in",
    text: "new while active",
    ts: 1200,
    source: "dom"
  }
]);
assert.equal(store.getChat("pm:kaepee").unread, 0, "messages appended to active chat must not increment unread");

store.appendMessages("pm:kaepee", [
  {
    messageId: "m-rich",
    direction: "in",
    text: "",
    parts: [
      {
        type: "image",
        kind: "emoticon",
        src: "https://static-pub.highwebmedia.com/emoticons/hihi.gif",
        alt: ":hihi",
        width: 25,
        height: 25
      }
    ],
    ts: 1250,
    source: "dom"
  }
]);
let richMessage = store.getChat("pm:kaepee").messages.find((message) => message.messageId === "m-rich");
assert.equal(richMessage.text, ":hihi", "image-only rich message must keep a text fallback");
assert.deepEqual(JSON.parse(JSON.stringify(richMessage.parts)), [
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

store.setActiveChat(null);
store.appendMessages("pm:kaepee", [
  {
    messageId: "m3",
    direction: "in",
    text: "new while inactive",
    ts: 1300,
    source: "network"
  }
]);
assert.equal(store.getChat("pm:kaepee").unread, 1, "inactive chat must derive unread from new messages");

store.mergeSources("pm:kaepee", ["dom", "network", "demo"]);
assert.deepEqual(JSON.parse(JSON.stringify(store.getChat("pm:kaepee").sources.sort())), ["demo", "dom", "network"]);

store.appendMessages("pm:kaepee", [
  {
    direction: "in",
    text: "",
    parts: [
      {
        type: "image",
        kind: "emoji",
        src: "https://static-pub.highwebmedia.com/emoji/rose.png",
        alt: "\u{1F339}",
        width: 18,
        height: 18
      }
    ],
    ts: 1400,
    source: "dom"
  },
  {
    direction: "in",
    text: "",
    parts: [
      {
        type: "image",
        kind: "emoji",
        src: "https://static-pub.highwebmedia.com/emoji/rose.png",
        alt: "\u{1F339}",
        width: 18,
        height: 18
      }
    ],
    ts: 1400,
    source: "network"
  }
]);
const roseMessages = store.getChat("pm:kaepee").messages.filter((message) => message.text === "\u{1F339}");
assert.equal(roseMessages.length, 1, "fallback dedupe must include rich parts for image-only messages");

store.appendMessages("pm:kaepee", [
  {
    messageId: "m-photo",
    direction: "in",
    text: "",
    attachments: [
      {
        id: "photo-6-0",
        type: "photo",
        state: "unopened",
        previewPolicy: "visible-thumbnail",
        previewUrl: "https://media-secret.chaturbate.test/private/raw-member-photo.jpg?token=super-secret",
        previewIsBlurred: true,
        actionKind: "open-photo",
        nativeActionKey: "pm:kaepee:6:0:open-photo",
        nativeAction: { leaked: true }
      }
    ],
    ts: 1500,
    source: "dom"
  }
]);
const photoMessage = store.getChat("pm:kaepee").messages.find((message) => message.messageId === "m-photo");
assert.equal(photoMessage.text, "", "photo-only attachments must not gain a New text fallback");
assert.deepEqual(JSON.parse(JSON.stringify(photoMessage.attachments)), [
  {
    id: "photo-6-0",
    type: "photo",
    state: "unopened",
    previewPolicy: "visible-thumbnail",
    previewUrl: "",
    previewIsBlurred: true,
    actionKind: "open-photo",
    nativeActionKey: "pm:kaepee:6:0:open-photo"
  }
]);
assert(!JSON.stringify(photoMessage).includes("media-secret"), "ChatStore must not keep raw PM media URLs");
assert(!JSON.stringify(photoMessage).includes("super-secret"), "ChatStore must not keep raw PM media tokens");
assert(!JSON.stringify(photoMessage).includes("leaked"), "ChatStore must not keep live DOM/native action refs");

console.log("chat-store-unit ok");
