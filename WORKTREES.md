# Worktrees

Parallel ideas live in separate `git worktree`s so they never trample each
other. The canonical enumerator is `git worktree list` (directory -> branch);
this file is the human-readable registry (idea, plan pointer, status) and must
be updated in the **same commit** as any worktree add/remove.

Worktree roots live under `~/git-worktrees/<repo>/<idea>/`.

## Registry

| Worktree dir | Branch | Idea | Plan file | Status |
|---|---|---|---|---|
| `~/git-worktrees/grantha-explorer/bring-in-ramayana-govindaraja` | `bring-in-ramayana-govindaraja` | Bring the Vālmīki Rāmāyaṇa (Govindarāja's Rāmāyaṇabhūṣaṇa commentary) into the explorer | `docs/DATA_FLOW.md` §7 (Rāmāyaṇa example); producer side: `grantha-data` `structured_md/ramayana/` + `docs/DATA_FLOW.md` §6.5 | Bāla-kāṇḍa ingested as a smoke test (75 parts, one per sarga, `ramayana-bhushana` commentary); full 7-kāṇḍa corpus (626 parts) ready in grantha-data. Flow mode renders per-sarga praveśas before each sarga's first verse; folio/sidebars hide prefatory labels. `ramayana` text_type, category, and `valmiki-ramayana` registered. ⚠️ **Blocker before merge:** folio sidebar performance with many loaded sargas — see `DEFERRED.md` #13 |
| `~/git-worktrees/grantha-explorer/bring-in-tatparyachandrika` | `bring-in-tatparyachandrika` | Bring Deśika's Tātparya-candrikā in as the first subcommentary of the Gītābhāṣya | `plans/PLAN_BRING_IN_TATPARYACHANDRIKA.md` | Full text shipped (intro + all 18 adhyāyas) |
| `~/git-worktrees/grantha-explorer/sribhashya-into-explorer` | `sribhashya-into-explorer` | Bring the Śrībhāṣya (Brahma-sūtra-bhāṣya) into the explorer | — | In progress |


## Resume (after weeks away)

```sh
git worktree list                      # authoritative: dir -> branch
cd ~/git-worktrees/<repo>/<idea>       # per registry above
git status -sb                          # where the idea left off
open plans/PLAN_<IDEA>.md              # refresh context
npm run dev                            # dev server for this worktree
```

## Teardown (idea done)

```sh
cd ~/git-worktrees/<repo>/<idea>
git add -A && git commit -m "..."      # land the work on its branch
git worktree remove ~/git-worktrees/<repo>/<idea>
# then update the registry table above and commit this file on main
```

## Notes

- Each worktree starts without `node_modules` (gitignored); run `npm install`
  once after `git worktree add` (`package-lock.json` is committed, so
  installs are reproducible).
- `.next/` and other gitignored state are per-worktree; tracked content is
  shared. A branch can be checked out in only one worktree at a time.
- Deleting a branch that still has an open worktree is refused by git — remove
  the worktree first.
