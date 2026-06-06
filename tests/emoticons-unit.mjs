import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const projectRoot = path.resolve(import.meta.dirname, "..");
const emoticonsPath = path.join(projectRoot, "src", "emoticons.js");

const context = {
  window: {},
  console
};
context.globalThis = context.window;

const source = fs.readFileSync(emoticonsPath, "utf8");
vm.runInNewContext(source, context, { filename: emoticonsPath });

const emoticons = context.window.CBMultichatEmoticons;

function plain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

assert.equal(typeof emoticons.findActiveQuery, "function");
assert.deepEqual(plain(emoticons.findActiveQuery("hello :he", 9)), {
  query: "he",
  token: ":he",
  start: 6,
  end: 9
});
assert.deepEqual(plain(emoticons.findActiveQuery(":wave", 5)), {
  query: "wave",
  token: ":wave",
  start: 0,
  end: 5
});
assert.equal(emoticons.findActiveQuery("hello:he", 8), null);
assert.equal(emoticons.findActiveQuery("https://x.test/:he", 18), null);
assert.equal(emoticons.findActiveQuery("meeting at 10:30", 16), null);
assert.equal(emoticons.findActiveQuery(`:${"a".repeat(41)}`, 42), null);

assert.deepEqual(plain(emoticons.replaceActiveQuery("hello :he world", 9, ":heart")), {
  value: "hello :heart world",
  caret: 13
});
assert.deepEqual(plain(emoticons.replaceActiveQuery(":he", 3, ":heart")), {
  value: ":heart ",
  caret: 7
});
assert.deepEqual(plain(emoticons.replaceActiveQuery("say :he", 7, "heart")), {
  value: "say :heart ",
  caret: 11
});
assert.equal(emoticons.replaceActiveQuery("hello:he", 8, ":heart"), null);

console.log("emoticons-unit ok");
