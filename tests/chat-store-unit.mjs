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

console.log("chat-store-unit ok");
