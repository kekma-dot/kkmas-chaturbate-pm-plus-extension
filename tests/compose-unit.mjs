import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const projectRoot = path.resolve(import.meta.dirname, "..");
const composePath = path.join(projectRoot, "src", "compose.js");

class FakeTextarea {
  constructor({ value = "", selectionStart = 0, selectionEnd = 0, scrollHeight = 38 } = {}) {
    this.value = value;
    this.selectionStart = selectionStart;
    this.selectionEnd = selectionEnd;
    this.selectionDirection = "none";
    this.scrollHeight = scrollHeight;
    this.style = {};
    this.dispatchedEvents = [];
    this.focused = false;
  }

  setSelectionRange(start, end, direction = "none") {
    this.selectionStart = start;
    this.selectionEnd = end;
    this.selectionDirection = direction;
  }

  dispatchEvent(event) {
    this.dispatchedEvents.push(event.type);
    return true;
  }

  focus() {
    this.focused = true;
  }
}

const context = {
  window: {},
  console,
  Event
};
context.globalThis = context.window;

const source = fs.readFileSync(composePath, "utf8");
vm.runInNewContext(source, context, { filename: composePath });

const compose = context.window.CBMultichatCompose;
assert.equal(typeof compose.resizeComposeInput, "function");
assert.equal(typeof compose.rememberComposeSelection, "function");
assert.equal(typeof compose.restoreComposeSelection, "function");
assert.equal(typeof compose.insertTextAtSelection, "function");

const tallInput = new FakeTextarea({ scrollHeight: 240 });
assert.equal(compose.resizeComposeInput(tallInput, { maxHeight: 156, minHeight: 38 }), 156);
assert.equal(tallInput.style.height, "156px");
assert.equal(tallInput.style.overflowY, "auto");

const shortInput = new FakeTextarea({ scrollHeight: 24 });
assert.equal(compose.resizeComposeInput(shortInput, { maxHeight: 156, minHeight: 38 }), 38);
assert.equal(shortInput.style.height, "38px");
assert.equal(shortInput.style.overflowY, "hidden");

const store = new WeakMap();
const message = new FakeTextarea({
  value: "hello beautiful member",
  selectionStart: 6,
  selectionEnd: 15
});
compose.rememberComposeSelection(message, store);
message.setSelectionRange(0, 0);
assert.equal(compose.restoreComposeSelection(message, store, { whenAtStart: true }), true);
assert.equal(message.selectionStart, 6);
assert.equal(message.selectionEnd, 15);

const inserted = compose.insertTextAtSelection(message, "sweet", store);
assert.equal(inserted, true);
assert.equal(message.value, "hello sweet member");
assert.equal(message.selectionStart, 11);
assert.equal(message.selectionEnd, 11);
assert.deepEqual(message.dispatchedEvents, ["input"]);

const clickMovedCaret = new FakeTextarea({
  value: "abcdef",
  selectionStart: 4,
  selectionEnd: 4
});
compose.rememberComposeSelection(clickMovedCaret, store);
clickMovedCaret.setSelectionRange(2, 2);
assert.equal(compose.restoreComposeSelection(clickMovedCaret, store, { whenAtStart: true }), false);
assert.equal(clickMovedCaret.selectionStart, 2);

console.log("compose-unit ok");
