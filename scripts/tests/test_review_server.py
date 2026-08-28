"""Tests for the standalone review server (``scripts/review-server.mjs``).

The server persists code-review-style annotations on grantha text to a
timestamped per-session JSON file, resolving each comment to its source
Markdown file (and that file's ``validation_hash``) from the real on-disk
``structured_md`` sources in the sibling ``grantha-data`` checkout.

The suite spawns the real server as a Node subprocess against:
  - ``--source-root`` = the real grantha-data checkout (read-only, for
    ``source_file``/``validation_hash`` resolution), OR a byte-identical copy
    under ``tmp_path`` for the drift test;
  - ``--reviews-dir``  = a ``tmp_path`` directory (the writable artifact area).

Tests exercise the live HTTP surface with stdlib ``urllib``. Skipped when the
sibling grantha-data checkout is absent (shallow CI checkout).
"""

from __future__ import annotations

import json
import pathlib
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import pytest

_SCRIPTS = pathlib.Path(__file__).parent.parent
_SERVER = _SCRIPTS / "review-server.mjs"

_EXPLORER_ROOT = _SCRIPTS.parent
_SIBLING_GRANTHA_DATA = _EXPLORER_ROOT.parent / "grantha-data"
_REAL_VEDARTHA = _SIBLING_GRANTHA_DATA / "structured_md" / "vedarthasangraha"
_EXPLORER_LIBRARY = _EXPLORER_ROOT / "public" / "data" / "library"

ALLOWED_ORIGIN = "http://localhost:3001"
FOREIGN_ORIGIN = "https://evil.example"


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


class ReviewServer:
    """A live review-server subprocess."""

    def __init__(
        self,
        source_root: pathlib.Path,
        reviews_dir: pathlib.Path,
        library_root: pathlib.Path | None = None,
    ):
        self.port = _free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        cmd = [
            "node",
            str(_SERVER),
            "--port",
            str(self.port),
            "--source-root",
            str(source_root),
            "--reviews-dir",
            str(reviews_dir),
        ]
        if library_root is not None:
            cmd += ["--library-root", str(library_root)]
        self.proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        self._wait_ready()

    def _wait_ready(self) -> None:
        deadline = time.time() + 10
        while time.time() < deadline:
            if self.proc.poll() is not None:
                out, err = self.proc.communicate()
                raise RuntimeError(
                    f"server exited early: {out!r} {err!r}"
                )
            try:
                # 404 route: reached only when the server is up, independent of
                # whether the probed grantha exists under this source-root.
                status, _ = self.request("GET", "/not-a-route")
                if status == 404:
                    return
                time.sleep(0.05)
            except OSError:
                time.sleep(0.1)
        raise RuntimeError("server did not become ready")

    def request(
        self,
        method: str,
        path: str,
        body: dict | None = None,
        headers: dict | None = None,
        raw_body: bytes | None = None,
    ) -> tuple[int, dict]:
        h = {"Content-Type": "application/json"}
        if headers:
            h.update(headers)
        data = raw_body
        if body is not None and raw_body is None:
            data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            self.base + path, data=data, method=method, headers=h
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                raw = resp.read()
                if not raw:
                    return resp.status, {}
                return resp.status, json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as e:
            payload = e.read().decode("utf-8")
            try:
                return e.code, json.loads(payload)
            except json.JSONDecodeError:
                return e.code, {"raw": payload}

    def stop(self) -> None:
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()


@pytest.fixture(scope="module")
def server(tmp_path_factory: pytest.TempPathFactory):
    if not _REAL_VEDARTHA.is_dir():
        pytest.skip("sibling grantha-data checkout not present")
    reviews_dir = tmp_path_factory.mktemp("reviews")
    srv = ReviewServer(_SIBLING_GRANTHA_DATA, reviews_dir, _EXPLORER_LIBRARY)
    yield srv, reviews_dir
    srv.stop()


def _post_path(grantha: str = "vedarthasangraha") -> str:
    """POST/PATCH paths carry the grantha in the query string (like GET)."""
    return f"/api/review?grantha={grantha}"


def _patch_path(grantha: str = "vedarthasangraha") -> str:
    return f"/api/review/status?grantha={grantha}"


def _valid_comment(**overrides) -> dict:
    c = {
        "id": str(uuid.uuid4()),
        "type": "citation-fix",
        "status": "open",
        "passage_ref": "17",
        "passage_type": "main",
        "kind": "Para",
        "anchor": {
            "start": 307,
            "end": 320,
            "line": 5,
            "snippet": "मनु.स्मृ १.२१",
        },
        "reference": {
            "index": 0,
            "start": 307,
            "end": 320,
            "display_text": "मनु.स्मृ १.२१",
            "locator": "1.21",
            "grantha_id": "manu-smriti",
        },
        "body": "Wrong locator — this is Manu 2.121.",
        "suggested_fix": {
            "locator": "2.121",
            "grantha_id": "manu-smriti",
            "display_text": "मनु.स्मृ २.१२१",
        },
    }
    c.update(overrides)
    return c


def _session_files(reviews_dir: pathlib.Path) -> list[pathlib.Path]:
    base = reviews_dir / "structured_md" / "vedarthasangraha" / "reviews"
    if not base.is_dir():
        return []
    return sorted(base.glob("vedarthasangraha.*.comments.json"))


def _latest_session(reviews_dir: pathlib.Path) -> pathlib.Path:
    files = _session_files(reviews_dir)
    assert files, "no session file written"
    return files[-1]


# ─────────────────────────────── happy path ──────────────────────────────


def test_empty_get_returns_null_session(server):
    srv, reviews_dir = server
    status, body = srv.request(
        "GET", "/api/review?grantha=vedarthasangraha"
    )
    assert status == 200
    assert body["session"] is None
    assert body["has_changed"] is False
    assert body["current_sources"] == {}


def test_post_creates_timestamped_session_file_with_source_resolution(server):
    srv, reviews_dir = server
    c = _valid_comment()
    status, body = srv.request("POST", _post_path(), c)
    assert status == 200
    sess = body["session"]
    assert sess["grantha_id"] == "vedarthasangraha"
    assert sess["revision"] == 1
    assert len(sess["comments"]) == 1
    saved = sess["comments"][0]
    # source_file resolved against the REAL md, and hash = its real frontmatter.
    assert saved["source_file"] == "vedarthasangraha-01.md"
    assert saved["source_hash"] == (
        "af3cb00c688fc0e26000808495ed4f21d88340268a3e81c8027075401897d360"
    )
    assert saved["part_num"] == 1
    assert saved["id"] == c["id"]
    # File on disk with the timestamped session filename.
    latest = _latest_session(reviews_dir)
    name = latest.name
    assert name.startswith("vedarthasangraha.") and name.endswith(".comments.json")
    disk = json.loads(latest.read_text(encoding="utf-8"))
    assert disk["grantha_id"] == "vedarthasangraha"
    # session_started_at is fixed at creation; updated_at is set on every write
    # and may be a few ms later than the first write.
    assert disk["updated_at"] >= disk["session_started_at"]
    assert "sources" in disk and disk["sources"]["vedarthasangraha-01.md"] == saved["source_hash"]


def test_post_resolves_prefatory_and_concluding_passages(server):
    srv, _ = server
    for passage_type, ref in (("prefatory", "0.1"), ("concluding", "253")):
        status, body = srv.request(
            "POST", _post_path(), _valid_comment(
                id=str(uuid.uuid4()),
                passage_ref=ref,
                passage_type=passage_type,
                kind="Prefatory" if passage_type == "prefatory" else "Concluding",
            )
        )
        assert status == 200


def test_citation_fix_with_suggested_fix_empty_body_accepted(server):
    """A citation-fix chosen from a candidate (no comment text) is valid — the
    suggested_fix is the substance; a body is optional."""
    srv, _ = server
    c = _valid_comment(
        id=str(uuid.uuid4()),
        body="",
        suggested_fix={"locator": "2.121", "grantha_id": "manu-smriti", "display_text": "मनु.स्मृ २.१२१"},
    )
    status, body = srv.request("POST", _post_path(), c)
    assert status == 200
    saved = next(x for x in body["session"]["comments"] if x["id"] == c["id"])
    assert saved["body"] == ""
    assert saved["suggested_fix"]["locator"] == "2.121"


def test_get_roundtrips_comment_and_drift_state(server):
    srv, _ = server
    c = _valid_comment(id=str(uuid.uuid4()))
    srv.request("POST", _post_path(), c)
    status, body = srv.request("GET", "/api/review?grantha=vedarthasangraha")
    assert status == 200
    sess = body["session"]
    assert sess["revision"] >= 1
    ids = [x["id"] for x in sess["comments"]]
    assert c["id"] in ids
    returned = next(x for x in sess["comments"] if x["id"] == c["id"])
    assert returned["hash_changed"] is False  # hash in sync with real md
    assert body["current_sources"]["vedarthasangraha-01.md"] == returned["source_hash"]
    assert body["has_changed"] is False


def test_upsert_same_id_updates_in_place(server):
    srv, _ = server
    cid = str(uuid.uuid4())
    status, before = srv.request("POST", _post_path(), _valid_comment(id=cid))
    assert status == 200
    edited = _valid_comment(id=cid, body="revised body")
    status, body = srv.request("POST", _post_path(), edited)
    assert status == 200
    sess = body["session"]
    matching = [x for x in sess["comments"] if x["id"] == cid]
    assert len(matching) == 1
    assert matching[0]["body"] == "revised body"
    assert sess["revision"] == before["session"]["revision"] + 1  # one more write


def test_patch_status(server):
    srv, _ = server
    cid = str(uuid.uuid4())
    srv.request("POST", _post_path(), _valid_comment(id=cid))
    status, body = srv.request(
        "PATCH", _patch_path(), {"id": cid, "status": "done"}
    )
    assert status == 200
    returned = next(x for x in body["session"]["comments"] if x["id"] == cid)
    assert returned["status"] == "done"


def test_patch_status_deleted_soft_delete(server):
    """Soft-delete is a first-class status (recoverable), accepted by the API."""
    srv, _ = server
    cid = str(uuid.uuid4())
    srv.request("POST", _post_path(), _valid_comment(id=cid))
    status, body = srv.request(
        "PATCH", _patch_path(), {"id": cid, "status": "deleted"}
    )
    assert status == 200
    returned = next(x for x in body["session"]["comments"] if x["id"] == cid)
    assert returned["status"] == "deleted"


def test_patch_status_reopen_from_deleted(server):
    """Reopen is the unified 'back to open' action for any non-open state."""
    srv, _ = server
    cid = str(uuid.uuid4())
    srv.request("POST", _post_path(), _valid_comment(id=cid))
    srv.request("PATCH", _patch_path(), {"id": cid, "status": "deleted"})
    status, body = srv.request(
        "PATCH", _patch_path(), {"id": cid, "status": "open"}
    )
    assert status == 200
    returned = next(x for x in body["session"]["comments"] if x["id"] == cid)
    assert returned["status"] == "open"


# ─────────────────────────────── candidates ──────────────────────────────


def test_candidates_returns_ranked_matches(server):
    """The citation-fix candidate scan surfaces the tattvamasi verse (6.8.7)
    when the reviewer's needle is selected text and 6.8.4 is the cited locator."""
    srv, _ = server
    status, body = srv.request(
        "POST",
        "/api/review/candidates",
        {
            "target": "chhandogya-upanishad",
            "edition": "chhandogya-upanishad",
            "needle": "तत्त्वमसि श्वेतकेतो",
            "exclude_locator": "6.8.4",
            "min_quality": 0.5,
        },
    )
    assert status == 200
    cands = body["candidates"]
    assert cands
    assert cands[0]["grantha_id"] == "chhandogya-upanishad"
    assert cands[0]["ref"] == "6.8.7"
    assert "तत् त्वमसि" in cands[0]["excerpt"]
    assert all(c["ref"] != "6.8.4" for c in cands)
    # Ranked descending by quality.
    quals = [c["quality"] for c in cands]
    assert quals == sorted(quals, reverse=True)


def test_candidates_missing_target_defaults_to_corpus(server):
    """No target → corpus-wide search (200), never a 422 (target is optional)."""
    srv, _ = server
    status, body = srv.request(
        "POST", "/api/review/candidates", {"needle": "तत्त्वमसि"}
    )
    assert status == 200
    assert isinstance(body["candidates"], list)


def test_candidates_422_missing_needle(server):
    srv, _ = server
    status, body = srv.request(
        "POST", "/api/review/candidates", {"target": "chhandogya-upanishad"}
    )
    assert status == 422


def test_candidates_corpus_finds_uncited_quote(server):
    """An uncited quote (तमेतं वेदानुवचनेन…) is located corpus-wide in
    brihadaranyaka 6.4.22 — the reviewer can find where it lives."""
    srv, _ = server
    status, body = srv.request(
        "POST",
        "/api/review/candidates",
        {
            "needle": "तमेतं वेदानुवचनेन ब्राह्मणा विविदिषन्ति यज्ञेन दानेन तपसानाशकेन",
            "min_quality": 0.5,
            "corpus": True,
        },
    )
    assert status == 200
    cands = body["candidates"]
    assert any(
        c["grantha_id"] == "brihadaranyaka-upanishad" and c["ref"] == "6.4.22"
        for c in cands
    )
    assert all(c["quality"] >= 0.5 for c in cands)



def test_new_session_creates_second_file_keeps_first(tmp_path):
    """On an isolated server: first save creates session A; 'new' creates B;
    A is retained on disk and GET returns the newest."""
    if not _REAL_VEDARTHA.is_dir():
        pytest.skip("sibling grantha-data checkout not present")
    reviews_dir = tmp_path / "reviews"
    reviews_dir.mkdir()
    srv = ReviewServer(_SIBLING_GRANTHA_DATA, reviews_dir, _EXPLORER_LIBRARY)
    try:
        srv.request("POST", _post_path(), _valid_comment())
        files = _session_files(reviews_dir)
        assert len(files) == 1
        first_name = files[0].name

        status, body = srv.request("POST", _post_path(), {"session": "new"})
        assert status == 200
        files = _session_files(reviews_dir)
        assert len(files) == 2  # old round retained, new one created
        # The original session file is untouched on disk.
        assert (reviews_dir / "structured_md" / "vedarthasangraha" / "reviews" / first_name).read_text(
            encoding="utf-8"
        ) != ""
        # GET returns the newest session by mtime (the empty "new" one).
        status, body = srv.request("GET", "/api/review?grantha=vedarthasangraha")
        assert status == 200
        assert body["session"]["comments"] == []  # newest session is empty
    finally:
        srv.stop()


def test_concurrent_posts_all_persist(server):
    srv, _ = server
    comments = [_valid_comment(id=str(uuid.uuid4()), body=f"comment {i}") for i in range(8)]
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda c: srv.request("POST", _post_path(), c), comments))
    assert all(s == 200 for s, _ in results)
    status, body = srv.request("GET", "/api/review?grantha=vedarthasangraha")
    ids = {x["id"] for x in body["session"]["comments"]}
    assert all(c["id"] in ids for c in comments)


# ─────────────────────────────── validation ──────────────────────────────


@pytest.mark.parametrize(
    "grantha_id",
    [
        "../../../etc/passwd",
        "VEDARTHASANGRAHA",
        "vedartha_sangraha",
        "a b",
        "vedartha..sangraha",
    ],
)
def test_invalid_grantha_id_rejected(server, grantha_id):
    srv, _ = server
    status, body = srv.request(
        "GET", f"/api/review?grantha={urllib.parse.quote(grantha_id, safe='')}"
    )
    assert status == 422


def test_unknown_grantha_rejected(server):
    srv, _ = server
    status, body = srv.request("GET", "/api/review?grantha=does-not-exist")
    assert status == 422


@pytest.mark.parametrize(
    "overrides",
    [
        {"id": "not-a-uuid"},
        {"type": "bogus"},
        {"status": "unknown"},
        {"passage_type": "marginalia"},
        {"type": "note", "body": ""},
        {"type": "note", "body": "   "},
        {"anchor": {"start": -1, "end": 5, "line": 1, "snippet": "x"}},
        {"anchor": {"start": 10, "end": 5, "line": 1, "snippet": "x"}},
        {"anchor": {"start": 0, "end": 2, "line": 0, "snippet": "x"}},
        {"anchor": {"start": 0, "end": 2, "line": 1, "snippet": ""}},
        {"suggested_fix": {"locator": "2..1"}},
    ],
)
def test_invalid_payload_rejected_422(server, overrides):
    srv, _ = server
    status, body = srv.request("POST", _post_path(), _valid_comment(**overrides))
    assert status == 422
    assert "error" in body


def test_unresolvable_passage_ref_rejected(server):
    srv, _ = server
    status, body = srv.request(
        "POST", _post_path(), _valid_comment(passage_ref="9999")
    )
    assert status == 422
    assert "passage" in body.get("error", "").lower() or "resolv" in body.get("error", "").lower()


def test_non_json_content_type_rejected(server):
    srv, _ = server
    raw = b"not json"
    status, body = srv.request(
        "POST", _post_path(), raw_body=raw, headers={"Content-Type": "text/plain"}
    )
    assert status == 415


def test_malformed_json_rejected(server):
    srv, _ = server
    status, body = srv.request(
        "POST", _post_path(), raw_body=b"{broken", headers={"Content-Type": "application/json"}
    )
    assert status == 400


# ─────────────────────────────── origin / CORS ───────────────────────────


def test_foreign_origin_rejected(server):
    srv, _ = server
    status, body = srv.request(
        "POST",
        "/api/review",
        _valid_comment(),
        headers={"Origin": FOREIGN_ORIGIN},
    )
    assert status == 403


def test_allowlisted_origin_accepted(server):
    srv, _ = server
    status, body = srv.request(
        "GET",
        "/api/review?grantha=vedarthasangraha",
        headers={"Origin": ALLOWED_ORIGIN},
    )
    assert status == 200
    assert body["has_changed"] is False


def test_preflight_allowed_origin(server):
    srv, _ = server
    status, body = srv.request(
        "OPTIONS", "/api/review", headers={"Origin": ALLOWED_ORIGIN, "Access-Control-Request-Method": "POST"}
    )
    assert status == 204 or status == 200


# ─────────────────────────────── drift detection ─────────────────────────


def test_drift_detected_when_source_changes(tmp_path):
    """Point the server at a byte-identical COPY of the real md, then change the
    copy's frontmatter hash to simulate an upstream edit — GET must report it."""
    src_root = tmp_path / "data"
    (src_root / "structured_md").mkdir(parents=True)
    shutil.copytree(_REAL_VEDARTHA, src_root / "structured_md" / "vedarthasangraha")
    reviews_dir = tmp_path / "reviews"
    reviews_dir.mkdir()
    srv = ReviewServer(src_root, reviews_dir)
    try:
        c = _valid_comment()
        srv.request("POST", _post_path(), c)
        status, body = srv.request("GET", "/api/review?grantha=vedarthasangraha")
        assert body["has_changed"] is False

        md = src_root / "structured_md" / "vedarthasangraha" / "vedarthasangraha-01.md"
        text = md.read_text(encoding="utf-8")
        md.write_text(
            text.replace(
                "validation_hash: af3cb00c688fc0e26000808495ed4f21d88340268a3e81c8027075401897d360",
                "validation_hash: " + "0" * 64,
            ),
            encoding="utf-8",
        )
        status, body = srv.request("GET", "/api/review?grantha=vedarthasangraha")
        assert status == 200
        assert body["has_changed"] is True
        returned = next(x for x in body["session"]["comments"] if x["id"] == c["id"])
        assert returned["hash_changed"] is True

        # Save-side drift flag on POST as well.
        status, body = srv.request("POST", _post_path(), c)
        assert body.get("hash_changed") is True
    finally:
        srv.stop()


# ─────────────────────────────── multipart resolution ────────────────────


def test_multipart_ref_partition_and_duplicate_detection(tmp_path):
    """Two part files partition refs; a colliding ref is a loud data error."""
    src_root = tmp_path / "data"
    (src_root / "structured_md").mkdir(parents=True)
    (src_root / "structured_md" / "brihadaranyaka-upanishad").mkdir(parents=True)
    frontmatter = (
        "---\ngrantha_id: brihadaranyaka-upanishad\npart_num: {n}\n"
        "language: sanskrit\nvalidation_hash: {h}\n---\n\n"
        "# Para 1\n\n<!-- sanskrit:devanagari -->\nअयम् आत्मा ब्रह्म\n<!-- /sanskrit:devanagari -->\n"
    )
    (src_root / "structured_md" / "brihadaranyaka-upanishad" / "brihadaranyaka-1.md").write_text(
        frontmatter.format(n=1, h="a" * 64), encoding="utf-8"
    )
    (src_root / "structured_md" / "brihadaranyaka-upanishad" / "brihadaranyaka-2.md").write_text(
        frontmatter.format(n=2, h="b" * 64).replace(
            "# Para 1", "# Para 2"
        ).replace("अयम् आत्मा ब्रह्म", "अहं ब्रह्मास्मि"),
        encoding="utf-8",
    )
    reviews_dir = tmp_path / "reviews"
    reviews_dir.mkdir()
    srv = ReviewServer(src_root, reviews_dir)
    try:
        c = _valid_comment(
            id=str(uuid.uuid4()),
            passage_ref="2",
            passage_type="main",
            kind="Para",
            body="multipart comment",
        )
        status, body = srv.request("POST", _post_path("brihadaranyaka-upanishad"), c)
        assert status == 200
        saved = body["session"]["comments"][0]
        assert saved["source_file"] == "brihadaranyaka-2.md"
        assert saved["part_num"] == 2
        assert saved["source_hash"] == "b" * 64

        # Now create a collision: part 2 gains a "Para 1" heading.
        md2 = src_root / "structured_md" / "brihadaranyaka-upanishad" / "brihadaranyaka-2.md"
        md2.write_text(
            md2.read_text(encoding="utf-8") + "# Para 1\n\n<!-- sanskrit:devanagari -->\nx\n<!-- /sanskrit:devanagari -->\n",
            encoding="utf-8",
        )
        status, body = srv.request(
            "POST", _post_path("brihadaranyaka-upanishad"), _valid_comment(id=str(uuid.uuid4()), passage_ref="1", passage_type="main", kind="Para", body="dup")
        )
        assert status == 422
    finally:
        srv.stop()
