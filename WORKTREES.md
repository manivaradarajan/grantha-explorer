# Worktrees

Parallel ideas live in separate `git worktree`s so they never trample each
other. The canonical enumerator is `git worktree list` (directory -> branch);
this file is the human-readable registry (idea, plan pointer, status) and must
be updated in the **same commit** as any worktree add/remove.

Worktree roots live under `~/git-worktrees/<repo>/<idea>/`.

## Registry

| Worktree dir | Branch | Idea | Plan file | Status |
|---|---|---|---|---|
| `~/git-worktrees/grantha-explorer/bring-in-tatparyachandrika` | `bring-in-tatparyachandrika` | Bring Deśika's Tātparya-candrikā in as the first subcommentary of the Gītābhāṣya | `plans/PLAN_BRING_IN_TATPARYACHANDRIKA.md` | Full text shipped (intro + all 18 adhyāyas). PRs open — see "Next steps" in the plan: confirm data CI green, merge data PR then explorer PR |


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
