#!/usr/bin/env node
/**
 * Print the first free port for a new `next dev` instance, starting at
 * `DEV_PORT_BASE` (default 3000) and incrementing while ports are taken.
 *
 * Multiple `npm run dev` instances can then run side by side: the first grabs
 * 3000, the next 3001, and so on. Set DEV_PORT_BASE to offset the whole range
 * (e.g. start a separate set of instances from 4000).
 *
 * Prints only the port number to stdout so callers can capture it:
 *   next dev -p $(node scripts/next-dev-port.mjs)
 */

import net from "node:net";

const BASE = Number.parseInt(process.env.DEV_PORT_BASE || "3000", 10);
const MAX_TRIES = 100;

const isFree = (port) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "0.0.0.0");
  });

for (let port = BASE; port < BASE + MAX_TRIES; port += 1) {
  if (await isFree(port)) {
    process.stdout.write(String(port));
    process.exit(0);
  }
}

process.stderr.write(
  `No free port found in [${BASE}, ${BASE + MAX_TRIES}). ` +
    `Raise DEV_PORT_BASE.\n`,
);
process.exit(1);
