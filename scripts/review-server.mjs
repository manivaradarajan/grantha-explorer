#!/usr/bin/env node
/**
 * Standalone review server for Grantha Explorer's edit mode.
 *
 * Persists code-review-style annotations (comments) on grantha text to a
 * timestamped, per-review-session JSON file, resolving each comment to its
 * source Markdown file (and that file's ``validation_hash``) from the on-disk
 * ``structured_md`` sources in the sibling ``grantha-data`` checkout.
 *
 * The explorer UI (``?m=edit``) talks to this server over HTTP on
 * 127.0.0.1. It is a LOCAL single-reviewer tool: no auth, no multi-user, and
 * every write is serialized per grantha through an in-process mutex with an
 * atomic tmp+rename write.
 *
 * Endpoints:
 *   GET    /api/review?grantha=<id>   → latest session + drift state
 *   GET    /api/review?grantha=<id>&file=<name> → a specific round
 *   GET    /api/review/files?grantha=<id> → list rounds (round picker)
 *   POST   /api/review                → upsert a comment, or {session:"new"}
 *   PATCH  /api/review/status         → {id, status}
 *   OPTIONS /api/review               → CORS preflight
 *
 * CLI: review-server.mjs [--port N] [--source-root PATH] [--reviews-dir PATH]
 * Env: GRANTHA_SOURCE_ROOT, GRANTHA_REVIEWS_DIR (overridden by CLI flags).
 */

import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────── configuration ─────────────────────────────

function parseArgs(argv) {
  const args = { port: 4321 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--port") args.port = Number.parseInt(argv[++i], 10);
    else if (a === "--source-root") args.sourceRoot = argv[++i];
    else if (a === "--reviews-dir") args.reviewsDir = argv[++i];
    else if (a === "--library-root") args.libraryRoot = argv[++i];
    else if (a === "--python") args.python = argv[++i];
  }
  // Default source root = the sibling grantha-data checkout (this file lives in
  // grantha-explorer/scripts/, so the sibling is two levels up).
  const defaultSourceRoot = path.resolve(__dirname, "..", "..", "grantha-data");
  args.sourceRoot = args.sourceRoot || process.env.GRANTHA_SOURCE_ROOT || defaultSourceRoot;
  // Default library root = this explorer checkout's committed library.
  args.libraryRoot =
    args.libraryRoot || process.env.GRANTHA_LIBRARY_ROOT || path.resolve(__dirname, "..", "public", "data", "library");
  args.reviewsDir = args.reviewsDir || process.env.GRANTHA_REVIEWS_DIR || args.sourceRoot;
  args.python = args.python || defaultPython(args);
  const structured = path.join(args.sourceRoot, "structured_md");
  if (!fs.existsSync(structured)) {
    console.error(
      `[review-server] ERROR: no structured_md under source-root ${args.sourceRoot}. ` +
        `Point --source-root at the grantha-data checkout (or set GRANTHA_SOURCE_ROOT).`,
    );
    process.exit(1);
  }
  return args;
}

// ─────────────────────────────── constants ────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);

const GRANTHA_ID_RE = /^[a-z0-9-]+$/;
const LOCATOR_RE = /^[0-9]+(?:\.[0-9]+)*$/;
const COMMENT_TYPES = new Set(["citation-fix", "quote-locate", "note"]);
// `done` is the legacy alias for `accepted` (in-flight old sessions / old
// clients); it is accepted on write but canonicalized to `accepted` when the
// transition runs.
const COMMENT_STATUSES = new Set(["open", "fixed", "accepted", "reopened", "dismissed", "deleted", "done"]);
const PASSAGE_TYPES = new Set(["main", "prefatory", "concluding"]);

/** Legal comment-status transitions (mirrors grantha_data.review_comments). */
const LEGAL_TRANSITIONS = {
  open: ["fixed", "dismissed", "deleted"],
  fixed: ["accepted", "reopened", "open", "dismissed", "deleted"],
  reopened: ["fixed", "accepted", "open", "dismissed", "deleted"],
  accepted: ["open", "dismissed", "deleted"],
  dismissed: ["open", "deleted"],
  deleted: ["open"], // soft-delete is recoverable
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─────────────────────────────── helpers ──────────────────────────────────

function isStr(v) {
  return typeof v === "string";
}

function isNonEmptyStr(v) {
  return isStr(v) && v.trim().length > 0;
}

function isInt(v) {
  return Number.isInteger(v);
}

function nowIso() {
  return new Date().toISOString();
}

function sessionTimestamp() {
  return nowIso().replace(/\D/g, "").slice(0, 14); // YYYYMMDD-HHMMSS minus the dash
}

function sessionFileName(granthaId, reviewsDir) {
  const ts = sessionTimestamp();
  const base = `${granthaId}.${ts.slice(0, 8)}-${ts.slice(8)}`;
  let name = `${base}.comments.json`;
  // Two sessions created in the same second must not collide (glob-latest
  // semantics). Append a short random suffix only when a name is already taken.
  if (reviewsDir) {
    try {
      const exists = fs.existsSync(path.join(reviewsDir, name));
      if (exists) name = `${base}-${randomUUID().slice(0, 6)}.comments.json`;
    } catch {
      /* best-effort */
    }
  }
  return name;
}

function reviewsDirFor(cfg, granthaId) {
  return path.join(cfg.reviewsDir, "structured_md", granthaId, "reviews");
}

function validateGranthaId(granthaId) {
  if (!isNonEmptyStr(granthaId) || !GRANTHA_ID_RE.test(granthaId)) {
    return "grantha_id must match ^[a-z0-9-]+$";
  }
  return null;
}

/** Best-effort default Python for the candidate scan. Resolution order:
 *  1. an explicitly configured ``--python`` or ``GRANTHA_PYTHON``;
 *  2. the grantha-data checkout's own ``.venv/bin/python`` (the same source-root
 *     the server reads; its editable install provides yaml + grantha_data);
 *  3. ``python3``.
 *
 * No worktree path is hardcoded — the venv is derived from the configured
 * source-root. Callers can always pin one explicitly. */
function defaultPython(cfg) {
  if (process.env.GRANTHA_PYTHON) return process.env.GRANTHA_PYTHON;
  const sourceVenv = path.join(cfg.sourceRoot, ".venv", "bin", "python");
  if (fs.existsSync(sourceVenv)) return sourceVenv;
  return "python3";
}

function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split("\n")) {
    const hash = /^validation_hash:\s*(\S+)/.exec(line);
    if (hash) out.validation_hash = hash[1];
    const part = /^part_num:\s*(\d+)/.exec(line);
    if (part) out.part_num = Number.parseInt(part[1], 10);
  }
  return out;
}

const HEADING_RE = {
  main: /^#\s+([A-Za-z]+)\s+([0-9.]+)\s*$/,
  prefatory: /^#\s+Prefatory:\s+([0-9.]+)/,
  concluding: /^#\s+Concluding:\s+([0-9.]+)/,
};

/**
 * Build (and cache, invalidated by file mtime) the per-grantha passage→file
 * index. Ref spaces partition across part files; a ref found in two files is a
 * loud data error.
 */
class GranthaIndex {
  constructor(sourceRoot, granthaId) {
    this.sourceRoot = sourceRoot;
    this.granthaId = granthaId;
    this.dir = path.join(sourceRoot, "structured_md", granthaId);
    this.byKey = new Map(); // "passage_type\x00ref" -> {file, part_num}
    this.fileMeta = new Map(); // filename -> {mtimeMs, validation_hash, part_num}
    this.mtimes = new Map();
  }

  needsRebuild() {
    try {
      const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".md"));
      if (files.length !== this.mtimes.size) return true;
      for (const f of files) {
        const st = fs.statSync(path.join(this.dir, f));
        if (this.mtimes.get(f) !== st.mtimeMs) return true;
      }
      return false;
    } catch {
      return true;
    }
  }

  rebuild() {
    this.byKey = new Map();
    this.fileMeta = new Map();
    this.mtimes = new Map();
    for (const f of fs.readdirSync(this.dir).filter((x) => x.endsWith(".md"))) {
      const full = path.join(this.dir, f);
      const st = fs.statSync(full);
      this.mtimes.set(f, st.mtimeMs);
      const text = fs.readFileSync(full, "utf-8");
      const fm = parseFrontmatter(text);
      this.fileMeta.set(f, {
        validation_hash: fm.validation_hash || null,
        part_num: fm.part_num || null,
      });
      for (const line of text.split("\n")) {
        if (!line.startsWith("# ")) continue;
        for (const [passageType, re] of Object.entries(HEADING_RE)) {
          const m = re.exec(line);
          if (!m) continue;
          const ref = passageType === "main" ? m[2] : m[1];
          const key = `${passageType}\x00${ref}`;
          if (this.byKey.has(key)) {
            const other = this.byKey.get(key);
            throw new AmbiguousIndexError(
              `ambiguous passage ${passageType} "${ref}" — found in both ` +
                `"${other.file}" and "${f}"`,
            );
          }
          this.byKey.set(key, { file: f });
        }
      }
    }
  }

  resolve(passageType, ref) {
    return this.byKey.get(`${passageType}\x00${ref}`) || null;
  }

  metaFor(file) {
    return this.fileMeta.get(file) || null;
  }
}

const _indexCache = new Map(); // `${sourceRoot}\x00${granthaId}` -> GranthaIndex

function getIndex(cfg, granthaId) {
  const key = `${cfg.sourceRoot}\x00${granthaId}`;
  let idx = _indexCache.get(key);
  if (!idx || idx.needsRebuild()) {
    idx = new GranthaIndex(cfg.sourceRoot, granthaId);
    idx.rebuild();
    _indexCache.set(key, idx);
  }
  return idx;
}

// ─────────────────────────────── validation ────────────────────────────────

function validateComment(c) {
  const fields = {};
  const err = (name, msg) => {
    fields[name] = msg;
  };

  if (!c || typeof c !== "object") {
    return { "": "body must be a JSON object" };
  }
  if (!isNonEmptyStr(c.id) || !UUID_RE.test(c.id)) err("id", "must be a UUID v4 string");
  if (!COMMENT_TYPES.has(c.type)) err("type", "must be one of citation-fix, quote-locate, note");
  if (!COMMENT_STATUSES.has(c.status)) err("status", "must be one of open, fixed, accepted, reopened, dismissed, deleted, done");
  if (!PASSAGE_TYPES.has(c.passage_type)) err("passage_type", "must be main, prefatory, or concluding");
  if (!isNonEmptyStr(c.passage_ref)) err("passage_ref", "must be a non-empty string");
  if (c.kind !== undefined && !isNonEmptyStr(c.kind)) err("kind", "must be a non-empty string");

  const a = c.anchor;
  if (!a || typeof a !== "object") {
    err("anchor", "required");
  } else {
    if (!isInt(a.start) || a.start < 0) err("anchor.start", "must be an integer >= 0");
    if (!isInt(a.end) || a.end < a.start) err("anchor.end", "must be an integer >= start");
    if (!isInt(a.line) || a.line < 1) err("anchor.line", "must be an integer >= 1");
    if (!isNonEmptyStr(a.snippet)) err("anchor.snippet", "must be a non-empty string");
  }

  const r = c.reference;
  if (r !== undefined && r !== null) {
    if (typeof r !== "object") err("reference", "must be an object");
    else {
      if (!isInt(r.index) || r.index < 0) err("reference.index", "must be an integer >= 0");
      if (!isInt(r.start) || r.start < 0) err("reference.start", "must be an integer >= 0");
      if (!isInt(r.end) || r.end <= r.start) err("reference.end", "must be an integer > start");
      if (!isNonEmptyStr(r.display_text)) err("reference.display_text", "required");
      if (r.locator !== undefined && !isNonEmptyStr(r.locator)) err("reference.locator", "must be non-empty");
      if (r.grantha_id !== undefined && !isNonEmptyStr(r.grantha_id)) err("reference.grantha_id", "must be non-empty");
    }
  }

  // A body is normally required, EXCEPT a citation-fix that carries a concrete
  // suggested_fix (a chosen candidate or a typed locator) — the fix itself is
  // the substance; a body is optional.
  const hasSuggestedFix =
    c.type === "citation-fix" &&
    c.suggested_fix &&
    typeof c.suggested_fix === "object" &&
    (isNonEmptyStr(c.suggested_fix.locator) ||
      isNonEmptyStr(c.suggested_fix.display_text));
  if (!hasSuggestedFix && !isNonEmptyStr(c.body)) {
    err("body", "must be a non-empty string (or select a candidate)");
  }

  const f = c.suggested_fix;
  if (f !== undefined && f !== null) {
    if (typeof f !== "object") err("suggested_fix", "must be an object");
    else {
      for (const k of ["locator", "grantha_id", "display_text", "note"]) {
        if (f[k] !== undefined && !isNonEmptyStr(f[k])) err(`suggested_fix.${k}`, "must be non-empty when present");
      }
      if (f.locator !== undefined && !LOCATOR_RE.test(f.locator)) {
        err("suggested_fix.locator", "must match ^[0-9.]+$");
      }
    }
  }

  return fields;
}

// ─────────────────────────────── sessions ──────────────────────────────────

const activeSessions = new Map(); // granthaId -> {file, session}

function newSession(granthaId) {
  return {
    grantha_id: granthaId,
    session_started_at: nowIso(),
    updated_at: nowIso(),
    revision: 0,
    sources: {},
    comments: [],
  };
}

function recomputeSources(session) {
  const sources = {};
  for (const c of session.comments) {
    if (c.source_file && c.source_hash) sources[c.source_file] = c.source_hash;
  }
  session.sources = sources;
}

async function latestSessionOnDisk(cfg, granthaId) {
  const dir = reviewsDirFor(cfg, granthaId);
  const files = await listSessionFiles(dir, granthaId);
  if (files.length === 0) return null;
  const file = path.join(dir, files[files.length - 1]);
  const session = JSON.parse(await fsp.readFile(file, "utf-8"));
  return { file, session };
}

/** Load the session to write into: always the latest round from DISK (never a
 *  stale in-memory copy, which would clobber an external edit). Creates a fresh
 *  session file when none exists. Sets it as the active session. */
async function loadActiveSession(cfg, granthaId) {
  const disk = await latestSessionOnDisk(cfg, granthaId);
  let file;
  let session;
  if (disk) {
    ({ file, session } = disk);
  } else {
    session = newSession(granthaId);
    file = path.join(reviewsDirFor(cfg, granthaId), sessionFileName(granthaId, reviewsDirFor(cfg, granthaId)));
  }
  activeSessions.set(granthaId, { file, session });
  return { file, session };
}

/** The ``*.comments.json`` files for a grantha's review dir, sorted oldest →
 *  newest. mtime is the primary key; ties (e.g. two rounds written in the same
 *  millisecond) break toward the lexicographically-LATER filename (which
 *  encodes a later timestamp) so the newest round wins deterministically. */
async function listSessionFiles(dir, granthaId) {
  let files;
  try {
    files = (await fsp.readdir(dir)).filter((f) =>
      f.startsWith(`${granthaId}.`) && f.endsWith(".comments.json"),
    );
  } catch {
    return [];
  }
  // Pre-collect mtimes asynchronously (fsp has no statSync) so the sort
  // comparator can be a pure sync function.
  const mtimeOf = new Map(
    await Promise.all(
      files.map(async (f) => {
        try {
          const st = await fsp.stat(path.join(dir, f));
          return [f, st.mtimeMs];
        } catch {
          return [f, NaN];
        }
      }),
    ),
  );
  files.sort((a, b) => {
    const ma = mtimeOf.get(a);
    const mb = mtimeOf.get(b);
    if (!Number.isNaN(ma) && !Number.isNaN(mb) && ma !== mb) return ma - mb;
    return b.localeCompare(a); // newer timestamp name sorts first when mtimes tie/unknown
  });
  return files;
}

/** Count active comments by status for a session (for the round picker). */
function sessionCounts(session) {
  const counts = {
    open: 0,
    fixed: 0,
    accepted: 0,
    reopened: 0,
    dismissed: 0,
    deleted: 0,
  };
  for (const c of session.comments || []) {
    const s = c.status === "done" ? "accepted" : c.status;
    if (s in counts) counts[s] += 1;
  }
  return counts;
}

async function writeSession(cfg, granthaId, file, session) {
  const dir = reviewsDirFor(cfg, granthaId);
  await fsp.mkdir(dir, { recursive: true });
  session.revision += 1;
  session.updated_at = nowIso();
  const tmp = path.join(dir, `.${path.basename(file)}.${randomUUID()}.tmp`);
  await fsp.writeFile(tmp, JSON.stringify(session, null, 2) + "\n", "utf-8");
  await fsp.rename(tmp, file);
}

/** Per-grantha promise-queue mutex so read-modify-write never loses updates. */
const _mutexTail = new Map();

function withGranthaLock(granthaId, fn) {
  const tail = _mutexTail.get(granthaId) || Promise.resolve();
  const run = tail.then(fn, fn);
  _mutexTail.set(granthaId, run.catch(() => {}));
  return run;
}

// ─────────────────────────────── resolution ────────────────────────────────

function resolveSource(cfg, granthaId, comment) {
  const idx = getIndex(cfg, granthaId);
  const hit = idx.resolve(comment.passage_type, comment.passage_ref);
  if (!hit) {
    throw new HttpError(
      422,
      `passage ${comment.passage_type} "${comment.passage_ref}" not found in any .md of ${granthaId}`,
    );
  }
  const meta = idx.metaFor(hit.file);
  return {
    source_file: hit.file,
    part_num: meta && meta.part_num,
    source_hash: meta && meta.validation_hash,
  };
}

function currentHashes(cfg, granthaId, files) {
  const idx = getIndex(cfg, granthaId);
  const out = {};
  for (const f of files) {
    const meta = idx.metaFor(f);
    if (meta && meta.validation_hash) out[f] = meta.validation_hash;
  }
  return out;
}

// ─────────────────────────────── responses ─────────────────────────────────

class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

class AmbiguousIndexError extends Error {}

function sendJson(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (origin && origin !== "null" && !ALLOWED_ORIGINS.has(origin)) {
    return null;
  }
  const allowOrigin = origin || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function checkHost(req) {
  const host = req.headers.host || "";
  let hostname = host;
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    return false;
  }
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Read and JSON-parse the request body; throw HttpError on parse failure. */
async function readJsonBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    throw new HttpError(400, "malformed JSON body");
  }
}

// ─────────────────────────────── handlers ──────────────────────────────────

function buildGetResponse(cfg, granthaId, session, sessionFile) {
  if (!session) {
    return { session: null, current_sources: {}, has_changed: false };
  }
  const files = [...new Set(session.comments.map((c) => c.source_file).filter(Boolean))];
  const current = currentHashes(cfg, granthaId, files);
  let hasChanged = false;
  const comments = session.comments.map((c) => {
    const hashChanged =
      !!c.source_file && current[c.source_file] !== undefined &&
      current[c.source_file] !== c.source_hash;
    if (hashChanged) hasChanged = true;
    return { ...c, hash_changed: hashChanged };
  });
  void sessionFile;
  return {
    session: { ...session, comments },
    current_sources: current,
    has_changed: hasChanged,
  };
}

async function handleGet(cfg, granthaId, file) {
  // Always (re)read from disk so an external edit to the session file (e.g. an
  // agent fixing anchor offsets) is never clobbered by a stale in-memory copy.
  let session = null;
  let filePath = null;
  if (file) {
    const dir = reviewsDirFor(cfg, granthaId);
    const files = await listSessionFiles(dir, granthaId);
    const match = files.find((f) => f === file);
    if (!match) throw new HttpError(404, `no review session file named ${file}`);
    filePath = path.join(dir, match);
    session = JSON.parse(await fsp.readFile(filePath, "utf-8"));
    activeSessions.set(granthaId, { file: filePath, session });
  } else {
    const disk = await latestSessionOnDisk(cfg, granthaId);
    if (disk) ({ file: filePath, session } = disk);
  }
  return buildGetResponse(cfg, granthaId, session, filePath);
}

/** List the review-session files (rounds) for a grantha, newest first, with
 *  summary counts — the data behind the round picker. Read-only. */
async function handleListSessions(cfg, granthaId) {
  const dir = reviewsDirFor(cfg, granthaId);
  const files = await listSessionFiles(dir, granthaId);
  const listed = [];
  for (const f of files) {
    let session;
    try {
      session = JSON.parse(await fsp.readFile(path.join(dir, f), "utf-8"));
    } catch {
      continue;
    }
    listed.push({
      name: f,
      started_at: session.session_started_at || null,
      updated_at: session.updated_at || null,
      revision: session.revision ?? 0,
      counts: sessionCounts(session),
    });
  }
  // Newest first for the picker's default selection.
  return { sessions: listed.reverse() };
}

async function handlePostComment(cfg, granthaId, comment) {
  return withGranthaLock(granthaId, async () => {
    const source = resolveSource(cfg, granthaId, comment);
    const resolved = { ...comment, ...source };

    let file;
    let session;
    ({ file, session } = await loadActiveSession(cfg, granthaId));

    const existingIdx = session.comments.findIndex((x) => x.id === comment.id);
    const prevHash =
      existingIdx >= 0 ? session.comments[existingIdx].source_hash : null;
    if (existingIdx >= 0) {
      session.comments[existingIdx] = resolved;
    } else {
      session.comments.push(resolved);
    }
    recomputeSources(session);
    await writeSession(cfg, granthaId, file, session);
    activeSessions.set(granthaId, { file, session });

    const current = currentHashes(cfg, granthaId, [source.source_file]);
    // Drift = the md changed relative to what the comment was written against.
    // For a new comment that is the hash resolved just now (no drift); for an
    // update it is the comment's previously stored hash.
    const referenceHash = prevHash ?? source.source_hash;
    const hashChanged =
      current[source.source_file] !== undefined &&
      current[source.source_file] !== referenceHash;

    return { session, hash_changed: hashChanged };
  });
}

async function handleNewSession(cfg, granthaId) {
  return withGranthaLock(granthaId, async () => {
    const session = newSession(granthaId);
    const file = path.join(reviewsDirFor(cfg, granthaId), sessionFileName(granthaId, reviewsDirFor(cfg, granthaId)));
    await writeSession(cfg, granthaId, file, session);
    activeSessions.set(granthaId, { file, session });
    return { session, created: true };
  });
}

async function handlePatchStatus(cfg, granthaId, body) {
  return withGranthaLock(granthaId, async () => {
    const fields = {};
    if (!body || !isNonEmptyStr(body.id)) {
      fields.id = "must be a non-empty string";
    }
    if (!body || !COMMENT_STATUSES.has(body.status)) {
      fields.status =
        "must be one of open, fixed, accepted, reopened, dismissed, deleted, done";
    }
    if (Object.keys(fields).length > 0) {
      throw new HttpError(
        422,
        `invalid status patch: ${Object.keys(fields).join(", ")}`,
        fields,
      );
    }
    let file;
    let session;
    ({ file, session } = await loadActiveSession(cfg, granthaId));
    const target = session.comments.find((x) => x.id === body.id);
    if (!target) throw new HttpError(422, `no comment with id ${body.id}`);

    // Canonicalize the legacy `done` alias and enforce the lifecycle state
    // machine (mirrors grantha_data.review_comments).
    const from = target.status === "done" ? "accepted" : target.status;
    const to = body.status === "done" ? "accepted" : body.status;
    if (!(LEGAL_TRANSITIONS[from] ?? []).includes(to)) {
      throw new HttpError(409, `illegal transition ${from} → ${to}`);
    }
    // Invariant: `accepted` (and the reopened→accepted shortcut) requires a
    // prior fix record.
    if (to === "accepted") {
      const fixes = Array.isArray(target.fixes) ? target.fixes : [];
      if (fixes.length === 0) {
        throw new HttpError(409, "cannot accept a comment with no fix record");
      }
    }
    if (to === "fixed") {
      const summary = isNonEmptyStr(body.fixSummary)
        ? body.fixSummary.trim()
        : body.summary ? String(body.summary).trim() : "";
      if (!summary) {
        throw new HttpError(422, "mark fixed requires a non-blank fix summary", {
          fixSummary: "must be a non-empty string",
        });
      }
      const fix = {
        applied_by: "reviewer",
        at: nowIso(),
        summary,
      };
      target.fixes = target.fixes ?? [];
      target.fixes.push(fix);
      delete target.accepted_at; // a new round starts fresh acceptance
    }
    if (to === "reopened") {
      const note = isNonEmptyStr(body.note) ? body.note.trim() : "";
      if (!note) {
        throw new HttpError(422, "needs work requires a non-blank note", {
          note: "must be a non-empty string",
        });
      }
      target.follow_ups = target.follow_ups ?? [];
      target.follow_ups.push({ note, at: nowIso(), by: "reviewer" });
    }
    if (to === "open") {
      delete target.accepted_at; // reset clears the round's acceptance
    }
    if (to === "accepted") {
      target.accepted_at = nowIso();
    }
    target.status = to;
    target.updated_at = nowIso();
    await writeSession(cfg, granthaId, file, session);
    activeSessions.set(granthaId, { file, session });
    return { session };
  });
}

/** Run the Python candidate scan and parse its JSON output. */
function runCandidatesPy(cfg, params) {
  const toolsLib = process.env.GRANTHA_DATA_TOOLS_LIB || path.resolve(cfg.sourceRoot, "tools", "lib");
  const script = path.join(__dirname, "review_candidates.py");
  const args = [
    script,
    "--library-root", cfg.libraryRoot,
    "--needle", params.needle,
    "--min-quality", String(params.minQuality ?? 0.7),
  ];
  if (params.corpus) {
    args.push("--corpus");
  } else {
    args.push("--target", params.target);
    if (params.edition) args.push("--edition", params.edition);
    if (params.excludeLocator) args.push("--exclude-locator", params.excludeLocator);
  }
  return new Promise((resolve, reject) => {
    execFile(
      cfg.python || process.env.GRANTHA_PYTHON || "python3",
      args,
      {
        cwd: path.join(__dirname, ".."),
        env: { ...process.env, GRANTHA_DATA_TOOLS_LIB: toolsLib },
        maxBuffer: 4 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || err.message).trim() || "candidate scan failed"));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error("candidate scan returned invalid JSON"));
        }
      },
    );
  });
}

async function handleCandidates(cfg, req) {
  if (req.method !== "POST") {
    throw new HttpError(405, "method not allowed");
  }
  const ct = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (ct !== "application/json") {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    throw new HttpError(400, "malformed JSON body");
  }
  if (!body || typeof body.needle !== "string" || !body.needle.trim()) {
    throw new HttpError(422, "candidate request requires a needle", {
      needle: "needle is required",
    });
  }
  const corpus = body.corpus === true || body.corpus === "true" || !body.target;
  if (!corpus && (typeof body.target !== "string" || !body.target.trim())) {
    throw new HttpError(422, "candidate request requires a target or corpus", {
      target: "target grantha_id is required (or set corpus: true)",
    });
  }
  const result = await runCandidatesPy(cfg, {
    corpus,
    target: body.target,
    edition: body.edition,
    needle: body.needle,
    excludeLocator: body.exclude_locator ?? body.excludeLocator,
    minQuality: typeof body.min_quality === "number" ? body.min_quality : 0.7,
  });
  return { candidates: result.candidates ?? [] };
}

// ─────────────────────────────── server ────────────────────────────────────

function route(cfg, req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    if (!cors) {
      sendJson(res, 403, { error: "origin not allowed" });
      return;
    }
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (!checkHost(req)) {
    sendJson(res, 403, { error: "host not allowed" });
    return;
  }
  if (
    pathname !== "/api/review" &&
    pathname !== "/api/review/status" &&
    pathname !== "/api/review/candidates" &&
    pathname !== "/api/review/files"
  ) {
    // Friendly landing page: this server is the edit-mode API, not the app.
    // A reviewer landing here (e.g. :4321/#...?m=edit) is on the wrong port.
    if (req.method === "GET" && (pathname === "/" || pathname === "/favicon.ico")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<!doctype html><meta charset='utf-8'><title>Grantha review server</title>" +
          "<body style='font-family:system-ui;padding:3rem;max-width:40rem;line-height:1.6'>" +
          "<h1>Grantha review server</h1>" +
          "<p>This is the <b>review API</b> used by edit mode (<code>?m=edit</code>). " +
          "It is not the app.</p>" +
          "<p>To review, open the explorer app instead, e.g.</p>" +
          "<p><code>http://localhost:3000/#vedarthasangraha:1?m=edit</code></p>" +
          "<p>with this server running. The app is served by <code>npm run dev</code> " +
          "(Next.js, ports 3000/3001); this server just saves the comments.</p>" +
          "</body>"
      );
      return;
    }
    sendJson(res, 404, { error: "not found" });
    return;
  }
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "PATCH") {
    sendJson(res, 405, { error: "method not allowed" }, cors);
    return;
  }
  if (!cors) {
    sendJson(res, 403, { error: "origin not allowed" }, cors);
    return;
  }

  const run = async () => {
    if (pathname === "/api/review/candidates") {
      const result = await handleCandidates(cfg, req);
      sendJson(res, 200, result, cors);
      return;
    }

    const granthaId = url.searchParams.get("grantha");
    const granthaErr = validateGranthaId(granthaId);
    if (granthaErr) throw new HttpError(422, granthaErr);
    if (!fs.existsSync(path.join(cfg.sourceRoot, "structured_md", granthaId))) {
      throw new HttpError(422, `no structured_md/${granthaId} under source-root`);
    }

    if (pathname === "/api/review/files") {
      if (req.method !== "GET") {
        throw new HttpError(405, "method not allowed");
      }
      const result = await handleListSessions(cfg, granthaId);
      sendJson(res, 200, result, cors);
      return;
    }

    if (req.method === "GET") {
      const body = await handleGet(cfg, granthaId, url.searchParams.get("file") || undefined);
      sendJson(res, 200, body, cors);
      return;
    }

    if (req.method === "PATCH") {
      const body = await readJsonBody(req);
      const result = await handlePatchStatus(cfg, granthaId, body);
      sendJson(res, 200, result, cors);
      return;
    }

    // POST
    const ct = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (ct !== "application/json") throw new HttpError(415, "Content-Type must be application/json");
    const body = await readJsonBody(req);
    if (body && body.session === "new") {
      const result = await handleNewSession(cfg, granthaId);
      sendJson(res, 200, result, cors);
      return;
    }
    const fields = validateComment(body);
    if (Object.keys(fields).length > 0) {
      throw new HttpError(422, "invalid comment payload", fields);
    }
    const result = await handlePostComment(cfg, granthaId, body);
    sendJson(res, 200, result, cors);
  };

  run().catch((err) => {
    if (err instanceof AmbiguousIndexError) {
      sendJson(res, 422, { error: err.message }, cors);
    } else if (err instanceof HttpError) {
      sendJson(res, err.status, { error: err.message, fields: err.fields }, cors);
    } else {
      console.error("[review-server]", err);
      sendJson(res, 500, { error: String(err && err.message || err) }, cors);
    }
  });
}

function start(cfg) {
  const server = http.createServer((req, res) => {
    route(cfg, req, res);
  });
  server.listen(cfg.port, "127.0.0.1", () => {
    console.error(
      `[review-server] listening on http://127.0.0.1:${cfg.port} ` +
        `(source-root: ${cfg.sourceRoot}, reviews-dir: ${cfg.reviewsDir})`,
    );
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cfg = parseArgs(process.argv.slice(2));
  start(cfg);
}

export { parseArgs, validateComment, validateGranthaId, start };
