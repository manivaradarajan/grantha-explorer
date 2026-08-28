"""Bridge: run the grantha-data candidate scan from the review server.

The review server (``scripts/review-server.mjs``) is plain Node and does not
have the TS matcher. This script invokes the Python citation-candidate scan
(``grantha_data.citation_repair.candidate_corrections``) — the authoritative,
parity-locked matcher — against the committed library, and prints the result as
JSON.

Usage (invoked by the review server as a subprocess):

    GRANTHA_DATA_TOOLS_LIB=<grantha-data>/tools/lib python3 scripts/review_candidates.py \
        --library-root <explorer>/public/data/library \
        --target chhandogya-upanishad \
        --edition chhandogya-upanishad \
        --needle "तत्त्वमसि श्वेतकेतो" \
        --exclude-locator 6.8.4 \
        --min-quality 0.5

Prints ``{"candidates": [{"grantha_id", "edition_id", "ref", "quality",
"excerpt"}]}`` to stdout. Non-zero exit + a message on stderr on error.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import grantha_data_bootstrap  # noqa: E402


def _resolve_library(seed: str) -> Path:
    """Resolve the library root: accept an explicit path or a grantha-data root
    (its sibling explorer checkout's ``public/data/library``)."""
    candidate = Path(seed).expanduser()
    if (candidate / "public" / "data" / "library").is_dir():
        return candidate / "public" / "data" / "library"
    if (candidate / "envelope.json").exists() or list(candidate.glob("*.json")):
        return candidate
    return candidate


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--library-root", required=True)
    parser.add_argument("--corpus", action="store_true",
                        help="search the whole corpus (ignores --target)")
    parser.add_argument("--target", help="target grantha_id")
    parser.add_argument("--edition", help="edition_id (default: grantha_id)")
    parser.add_argument("--needle", required=True)
    parser.add_argument("--exclude-locator")
    parser.add_argument("--min-quality", type=float, default=0.7)
    parser.add_argument(
        "--citing-text",
        default="",
        help="citing passage text (only used for a consistent matcher window)",
    )
    parser.add_argument("--citation-start", type=int, default=0)
    args = parser.parse_args(argv)

    try:
        grantha_data_bootstrap.ensure_grantha_data_importable()
        from grantha_data.citation_repair import (  # noqa: F401
            LibraryPassage,
            candidate_corrections,
            corpus_search,
            load_library,
        )
    except Exception as e:  # noqa: BLE001
        print(f"error: cannot import grantha_data: {e}", file=sys.stderr)
        return 2

    library_root = _resolve_library(args.library_root)
    library = load_library(library_root)

    if args.corpus:
        hits = corpus_search(
            args.needle,
            library,
            min_quality=args.min_quality,
            max_results=6,
        )
        out = {
            "corpus": True,
            "candidates": [
                {
                    "grantha_id": h.grantha_id,
                    "edition_id": h.edition_id,
                    "ref": h.ref,
                    "quality": round(h.quality, 3),
                    "excerpt": h.excerpt,
                }
                for h in hits
            ],
        }
        print(json.dumps(out, ensure_ascii=False))
        return 0

    if not args.target:
        print("error: --target (or --corpus) is required", file=sys.stderr)
        return 2
    edition = args.edition or args.target
    target = library.get((args.target, edition))
    if not target:
        # Fall back to any edition of the target.
        for (gid, _ed), passages in library.items():
            if gid == args.target:
                target = passages
                break
    if not target:
        # Target not in the committed library (a cited-but-absent work) — fall
        # back to a corpus-wide search so the reviewer can still locate the quote.
        hits = corpus_search(
            args.needle,
            library,
            min_quality=args.min_quality,
            max_results=6,
        )
        print(
            json.dumps(
                {
                    "corpus": True,
                    "searched_target": args.target,
                    "candidates": [
                        {
                            "grantha_id": h.grantha_id,
                            "edition_id": h.edition_id,
                            "ref": h.ref,
                            "quality": round(h.quality, 3),
                            "excerpt": h.excerpt,
                        }
                        for h in hits
                    ],
                },
                ensure_ascii=False,
            )
        )
        return 0

    candidates = candidate_corrections(
        citing_text=args.citing_text,
        citation_start=args.citation_start,
        needle=args.needle,
        target_passages=target,
        exclude_locator=args.exclude_locator,
        min_quality=args.min_quality,
    )
    out = {
        "corpus": False,
        "candidates": [
            {
                "grantha_id": args.target,
                "edition_id": edition,
                "ref": c.ref,
                "quality": round(c.quality, 3),
                "excerpt": c.excerpt,
            }
            for c in candidates
        ],
    }
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
