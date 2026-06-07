import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packageJsonPath = path.join(projectRoot, "package.json");
const runnerPath = path.join(projectRoot, "tests", "run-all.mjs");
const versionContractPath = path.join(projectRoot, "tests", "version-052-contract.mjs");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const runnerSource = fs.readFileSync(runnerPath, "utf8");

assert.equal(packageJson.private, true);
assert.equal(packageJson.version, "0.5.2");
assert.equal(packageJson.scripts.test, "node tests/run-all.mjs");
assert.equal(packageJson.scripts["test:unit"], "node tests/run-all.mjs --unit");
assert.equal(packageJson.scripts["test:smoke"], "node tests/content-behavior-smoke.mjs");
assert.equal(packageJson.scripts.check, "node tests/run-all.mjs --check");
assert.equal(fs.existsSync(runnerPath), true, "release test runner must exist");
assert.equal(fs.existsSync(versionContractPath), true, "0.5.2 contract test must exist");
assert(runnerSource.includes("tests/version-052-contract.mjs"), "release test runner must include the 0.5.2 contract test");

console.log("release-harness-unit ok");
