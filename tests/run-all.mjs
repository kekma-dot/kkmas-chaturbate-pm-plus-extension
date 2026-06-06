import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));

const unitCommands = [
  ["node", ["tests/diagnostics-unit.mjs"]],
  ["node", ["tests/network-probe-unit.mjs"]],
  ["node", ["tests/chat-store-unit.mjs"]],
  ["node", ["tests/chaturbate-adapter-unit.mjs"]],
  ["node", ["tests/compose-unit.mjs"]],
  ["node", ["tests/emoticons-unit.mjs"]],
  ["node", ["tests/release-harness-unit.mjs"]],
  ["node", ["tests/version-051-contract.mjs"]]
];

const checkCommands = [
  ["node", ["--check", "src/chat-store.js"]],
  ["node", ["--check", "src/chaturbate-adapter.js"]],
  ["node", ["--check", "src/compose.js"]],
  ["node", ["--check", "src/content.js"]],
  ["node", ["--check", "src/diagnostics.js"]],
  ["node", ["--check", "src/emoticons.js"]],
  ["node", ["--check", "src/network-probe-loader.js"]],
  ["node", ["--check", "src/network-probe-page.js"]],
  ["node", ["--check", "src/storage.js"]],
  ["node", ["-e", "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"]]
];

const smokeCommands = [
  ["node", ["tests/content-behavior-smoke.mjs"]]
];

const commands = args.has("--unit")
  ? unitCommands
  : args.has("--check")
    ? checkCommands
    : unitCommands.concat(checkCommands, smokeCommands);

for (const [command, commandArgs] of commands) {
  const label = [command].concat(commandArgs).join(" ");
  console.log(`\n$ ${label}`);
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("\nrelease test suite ok");
