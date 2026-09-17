# ADR-0011: Authorize explicit worktree cleanup by cwd containment

- **Status:** Accepted
- **Date:** 2026-09-17
- **Scope:** Managed subagent worktree cleanup (issue #45)

## Decision

A parent may explicitly remove one managed worktree when its canonical source
repository is within the session's canonical cwd subtree. This supersedes the
session-manifest-only ownership policy discussed in issue #45, per its
2026-09-17 scope update: ended sessions leave orphans whose manifests are no
longer reachable. A reachable owned manifest enriches inventory and is marked
removed after successful cleanup, but is not the authorization boundary.

Discovery joins the managed filesystem root, Git registration and working-tree
state, live Herdr workspace state, and current-session manifests. Unknown or
conflicting evidence blocks removal. Live children and persistent leases block
removal. Dirty work requires an explicit WIP preservation commit on the retained
branch; conflicts, locks, and initialized submodules cannot be bypassed.

Open workspaces are removed through Herdr. Git-only orphans use Git removal,
verify checkout absence, and then prune stale registrations. Branches and their
commits are retained. Session start only reports inventory counts.

## Rejected alternatives

- Session-only ownership cannot recover cross-session orphans.
- Global authorization would allow one project to remove another's review state.
- Automatic reaping at completion, shutdown, or on a timer erases the parent's
  opportunity to review retained work.
- Force removal and branch deletion are outside this feature's authority.
- Repo-global stashes make preserved work less visible than retained commits.
- Recursive filesystem deletion to bypass submodule protection is not supported.

## Consequences

Broad cwd values authorize broad repository subtrees, so callers must choose cwd
deliberately. Worktrees are not sandboxes. Fresh eligibility checks reduce but
cannot eliminate races with external writers; underlying refusals are surfaced,
not overridden. Unavailable process inspection prevents removal. Restart
inventory does not reattach watchers or rewrite other sessions' manifests.

See the [operating guide](../worktree-subagents.md#cleanup) for the shipped API.
