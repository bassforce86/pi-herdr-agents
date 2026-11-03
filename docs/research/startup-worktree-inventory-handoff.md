# Startup worktree inventory performance handoff

## Goal

Investigate and fix the long `interactiveMode.init` time when `pi-herdr-agents` starts inside Herdr. This is an investigation handoff, not a shipped contract or an accepted implementation plan.

## Reproduction and measurements

Environment: macOS, Pi 0.87.1, Herdr 0.9.1, installed `pi-herdr-agents` 2.0.4. Commands ran in an interactive Herdr pane with `PI_TIMING=1 PI_STARTUP_BENCHMARK=1`:

| Invocation | `interactiveMode.init` | Extension timing |
| --- | ---: | ---: |
| `pi -ne` | 18ms | — |
| `pi -ne -e npm:pi-herdr-agents` | 15,265ms | module import 46ms; factory 0ms |
| Same extension, with Herdr environment variables unset | 19ms | module import 44ms; factory 1ms |

The first npm invocation also installed the package/dependencies (759ms); subsequent measurement used installed package. This is not the source of the repeatable ~15s delay.

## Bottleneck evidence

The startup hook in `pi-extension/subagents/index.ts:3127-3160` awaits `listContainedWorktrees(cleanupInput(ctx))` during `session_start` when running as a parent session with a UI and Herdr available. Pi does not finish interactive initialization until this awaited work completes.

The extension’s managed-root scan is only two directory levels (`worktree-cleanup.ts:677-683`): `~/.herdr/worktrees/<repo>/<checkout>`. Enumerating these directories is fast and is not the bottleneck.

A temporary profiling harness copied the installed 2.0.4 `worktree-cleanup.ts` to `/tmp`, with Herdr/manifest dependencies stubbed, then called its real `createWorktreeCleanupOperations` and `listContainedWorktrees` against the current managed root and cwd. It found **61 checkout directories, zero with source repositories contained by the current cwd**, and took **16,141ms**. Per-checkout entries were inspected serially by `listContainedWorktrees` (`worktree-cleanup.ts:202-209`). The harness is not committed; no repo or installed-package files were changed.

Profiled Git subprocess costs across those 61 entries:

| Git check | Calls | Total elapsed |
| --- | ---: | ---: |
| `git submodule status --recursive` | 61 | 5,825ms |
| `git rev-parse --path-format=absolute --git-common-dir` | 122 | 1,703ms |
| `git ls-files --others --ignored --exclude-standard -z` | 61 | 1,495ms |
| `git status --porcelain=v1 --untracked-files=all -z` | 61 | 1,448ms |
| `git worktree list --porcelain -z` | 61 | 1,243ms |
| `git ls-files --others --exclude-standard -z` | 61 | 930ms |
| `git diff --name-only --diff-filter=U -z` | 61 | 873ms |
| Remaining branch/HEAD/source-root probes | 183 | ~2,624ms |

The stage ordering explains the wasted work: `inspectEntry` calls `ops.inspectGit(...)` at `worktree-cleanup.ts:157`, and only then checks `entry.contained` at lines 160-161. `inspectGit` runs the probes above at lines 479-541. Since all 61 source repos were outside `/Users/james.king/.config/home-manager`, none needed detailed state inspection. Contained-only Herdr workspace/process-holder checks were not invoked.

The direct profiling run (16.1s) is close to the Pi timing (15.3s); differences are expected from run conditions. `git submodule status --recursive` is the largest single contributor, but the total is the sum of many per-checkout subprocesses executed serially.

## Relevant code in this checkout

- `pi-extension/subagents/index.ts:3127-3160` — awaited startup inventory and notification.
- `pi-extension/subagents/worktree-cleanup.ts:121-174` — `inspectEntry`; full Git inspection currently precedes cwd-containment rejection.
- `pi-extension/subagents/worktree-cleanup.ts:202-209` — sequential inventory loop.
- `pi-extension/subagents/worktree-cleanup.ts:479-541` — per-checkout Git inspections, including recursive submodule status.
- `pi-extension/subagents/worktree-cleanup.ts:668-731` — managed-root scanning and production operations.
- `docs/worktree-subagents.md` — describes cleanup authorization and currently documents discovery of `~/.herdr/worktrees/*/*/`.
- `test/test.ts` — injected `WorktreeCleanupOperations` seam and session-start tests; inspect around the existing cleanup and `session_start` tests before choosing regression coverage.

This checkout is `pi-herdr-agents` 2.0.4 (`4cacc1a`, release commit), same version as installed package used for the reproduction.

## Candidate fixes to evaluate

1. **Prefilter by repository identity before detailed inspection.** Resolve the current cwd’s canonical Git common directory once. For each managed checkout, inspect its `.git` file/directory and linked-worktree `commondir` metadata (with realpath validation) to determine its common Git directory without starting a Git process. Skip expensive inspection when identity differs. If metadata is missing, malformed, or ambiguous, do not use the fast path to declare it out of scope; fall back to existing fail-closed inspection. Verify normal checkouts, linked worktrees, symlinks, nested cwd, missing checkout, and malformed `.git` metadata.
2. **Cache `git worktree list` per source repository.** `inspectGit` currently repeats this repo-wide query once for every checkout in the same source repo. Cache only within one inventory run; preserve fresh checks for explicit cleanup if required by safety contract.
3. **Keep startup path lighter than authoritative cleanup inspection.** Startup only emits a compact count; it may not need dirty/untracked/ignored/conflict/submodule/process checks. Consider a cheap, repo-identity-filtered startup snapshot or deferring full inventory until explicit `/worktree list`. Preserve full fail-closed revalidation for `worktree_remove` and full explicit inventory output. If startup notice meaning changes, update docs/tests.
4. **Do not merely parallelize all 61 inspections.** It might reduce wall time but retains unnecessary work and may overload disk/CPU. Prefer eliminating out-of-scope inspections first.

Path-prefix checks on checkout paths alone are not sufficient: managed checkout paths are outside source repository roots even when they belong to the current repository. Herdr workspace metadata can help for open worktrees, but cannot be the sole discovery source if inventory must include orphaned/offline worktrees.

## Suggested next steps

1. Read cleanup tests around `test/test.ts:6334-6650` and inspect operation injection patterns.
2. Prototype/test the cheap Git-common-dir identity prefilter against real and synthetic linked worktrees; record subprocess counts and timings.
3. Add a regression asserting out-of-scope checkouts avoid `inspectGit`, while in-scope checkouts still receive full safety inspection.
4. Keep explicit inventory/removal safety semantics intact; run `npm test`, format/lint, and focused Herdr tests only if needed. Do not run multiple Herdr integration suites concurrently.

No implementation changes have been made yet.
