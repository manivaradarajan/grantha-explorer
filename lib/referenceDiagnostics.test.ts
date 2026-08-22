// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  addReferenceDiagnostic,
  clearReferenceDiagnostics,
  getReferenceDiagnostics,
  isReferenceSuppressed,
  loadReferenceSuppressions,
  toBugsLine,
} from "./referenceDiagnostics";
import type { ReferenceDiagnostic, ReferenceSuppressions } from "./referenceDiagnostics";

const diag = (over: Partial<ReferenceDiagnostic> = {}): ReferenceDiagnostic => ({
  code: "REF-NOT-IN-LIBRARY",
  sourceGranthaId: "isavasya-upanishad",
  sourcePassageRef: "1",
  editionId: undefined,
  rawCitation: "वि. पु. १.२.२२",
  targetGranthaId: "vishnu-purana",
  locator: "1.2.22",
  offset: 5,
  knownInMeta: true,
  lastSeenAt: "2026-08-19T00:00:00Z",
  ...over,
});

describe("referenceDiagnostics", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("appends and reads diagnostics from localStorage", () => {
    addReferenceDiagnostic(diag());
    const log = getReferenceDiagnostics();
    expect(log).toHaveLength(1);
    expect(log[0].targetGranthaId).toBe("vishnu-purana");
  });

  it("dedupes by source + passage + offset + code", () => {
    addReferenceDiagnostic(diag());
    addReferenceDiagnostic(diag()); // same key
    addReferenceDiagnostic(diag({ offset: 6 })); // different offset → new entry
    expect(getReferenceDiagnostics()).toHaveLength(2);
  });

  it("refreshes lastSeenAt on a duplicate", () => {
    addReferenceDiagnostic(diag({ lastSeenAt: "old" }));
    addReferenceDiagnostic(diag({ lastSeenAt: "new" }));
    const log = getReferenceDiagnostics();
    expect(log).toHaveLength(1);
    expect(log[0].lastSeenAt).toBe("new");
  });

  it("clears the log", () => {
    addReferenceDiagnostic(diag());
    clearReferenceDiagnostics();
    expect(getReferenceDiagnostics()).toEqual([]);
  });

  it("isReferenceSuppressed matches target, ref, and code", () => {
    const s: ReferenceSuppressions = {
      grantha_ids: ["vishnu-purana"],
      refs: ["mundaka-upanishad:1.1"],
      codes: ["REF-RUNTIME-DEPTH-OVERFLOW"],
    };
    expect(isReferenceSuppressed(s, "vishnu-purana", "1.2.22", "REF-NOT-IN-LIBRARY")).toBe(true);
    expect(isReferenceSuppressed(s, "mundaka-upanishad", "1.1", "REF-NOT-IN-LIBRARY")).toBe(true);
    expect(isReferenceSuppressed(s, "katha-upanishad", "1.2.24", "REF-RUNTIME-DEPTH-OVERFLOW")).toBe(true);
    expect(isReferenceSuppressed(s, "katha-upanishad", "1.2.24", "REF-NOT-IN-LIBRARY")).toBe(false);
  });

  it("suppression axes are OR'd — a grantha_ids entry suppresses every code for that grantha", () => {
    const s: ReferenceSuppressions = {
      grantha_ids: ["vishnu-purana"],
      refs: [],
      codes: [],
    };
    // Any code for the listed grantha is suppressed, not only codes also
    // named in the codes axis.
    expect(isReferenceSuppressed(s, "vishnu-purana", "1.2.22", "REF-NOT-IN-LIBRARY")).toBe(true);
    expect(isReferenceSuppressed(s, "vishnu-purana", "1.2.22", "REF-RUNTIME-DEPTH-OVERFLOW")).toBe(true);
    expect(isReferenceSuppressed(s, "vishnu-purana", null, "REF-RUNTIME-UNRESOLVED")).toBe(true);
    // A different grantha is unaffected.
    expect(isReferenceSuppressed(s, "katha-upanishad", "1.2.24", "REF-NOT-IN-LIBRARY")).toBe(false);
  });

  it("loadReferenceSuppressions fetches the committed config", async () => {
    const stub = vi.fn(async () => new Response(JSON.stringify({
      grantha_ids: ["vishnu-purana"],
      refs: [],
      codes: [],
    })));
    vi.stubGlobal("fetch", stub);
    const s = await loadReferenceSuppressions();
    expect(s.grantha_ids).toEqual(["vishnu-purana"]);
  });

  it("toBugsLine formats a triage line", () => {
    const line = toBugsLine(diag());
    expect(line).toContain("vishnu-purana:1.2.22");
    expect(line).toContain("REF-NOT-IN-LIBRARY");
  });
});
