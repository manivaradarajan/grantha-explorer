#!/usr/bin/env node
/**
 * Run the edit-mode stack together: the local review server + the Next dev
 * server. Stops both cleanly on Ctrl-C.
 *
 *   npm run review:dev
 *
 * (Edit mode needs the review server for saving; the app alone only renders.)
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const children = [];

function start(name, cmd, args) {
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: ["ignore", "inherit", "inherit"],
    shell: false,
  });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      process.exitCode = code;
    }
  });
  children.push(child);
  return child;
}

// Review server (blocks nothing; runs in background of this process tree).
start("review", process.execPath, [path.join(here, "review-server.mjs")]);

// Give the review server a moment to bind before the app boots.
setTimeout(() => {
  // `npm run dev` runs `tsx scripts/generate-granthas-json.ts && next dev -p …`.
  start("dev", "npm", ["run", "dev"]);
}, 600);

function shutdown(signal) {
  console.log(`\n[review:dev] received ${signal} — stopping …`);
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
    }
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
