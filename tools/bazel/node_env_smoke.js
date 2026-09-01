/* Node smoke script for the Bazel-npm integration. */
const { readFileSync } = require("node:fs");
const path = require("node:path");

const version = JSON.parse(
  readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
).version;
const reactVersion = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "node_modules", "react", "package.json"),
    "utf8",
  ),
).version;
console.log(`package ${version}; react ${reactVersion}`);
