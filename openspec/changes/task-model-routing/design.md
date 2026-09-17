## Context

See proposal.md — Why. Current state that shapes the approach:

- Five config readers (`model-config.ts`, `role-config.ts`, `pane-config.ts`, `supervision-config.ts`, `persistent-config.ts`) each derive `PACKAGE_ROOT` independently and read `config.json` / `config.json.example` from the installed package root.
- `runtime-routing.ts` already builds a live authenticated model catalog (`buildAuthenticatedModelCatalog`) with provider, model ID, cost, and thinking-level data, and `index.ts` injects it into the `subagent` tool guidance via `buildSubagentRoutingGuidelines`.
- Model resolution (`resolveRuntimePlan`) already validates exact `provider/model-id` references against the registry, checks authentication, and supports comma-separated fallback chains (rejected for worktrees).
- Session-history evidence for the task taxonomy: 1,066 spawns — reviewer 52%, worker 32%, scout 10%, researcher 4%; name tokens dominated by review/build/research/test; 15% worktree usage.

## Goals / Non-Goals

**Goals:**

- One shared config-path resolution used by every reader, pointing at `~/.pi/agent/herdr-agents/config.json`.
- `models.tasks` as the single source of truth consumed by both the rendered guidance (LLM chooses) and `task:<category>` resolution (extension chooses).
- `task:` resolution layered onto the existing `resolveRuntimePlan` validation path, not a parallel resolver.
- A config schema that can gain a sibling `loops` section later without migration.

**Non-Goals:**

- No per-project config override; per-repo pinning stays in agent frontmatter and per-agent config keys.
- No automatic config refresh, staleness enforcement, or background re-research; `/subagents-init` is explicitly user-invoked.
- No change to review-independence enforcement: it stays a guidance-level rule for the parent LLM, because deterministic resolution cannot know which model authored the material under review.
- No loop templates in this change (see Future direction).

## Decisions

**D1 — Single shared config module.** Extract one `config-paths.ts` (or equivalent) that resolves the user config file at `join(homedir(), ".pi/agent/herdr-agents/config.json")` with the packaged `config.json.example` as fallback, and route all five readers through it. Alternative — patching five `PACKAGE_ROOT` constants — rejected: it preserves the duplication that caused the anti-pattern.

**D2 — Clean break, no legacy fallback.** The package-root `config.json` is never consulted. Alternative — precedence chain with deprecation warning — rejected by the user: the old location is a full anti-pattern, and `/subagents-init` regenerates the important section in one command. Consequence: major version bump; RELEASING/README call out the migration (move the file manually or re-run init).

**D3 — Taxonomy from observed usage.** Categories `coding`, `review`, `recon`, `qa`, `architecture`, `docs` — chosen from spawn-history frequency rather than a priori tiers. `qa` is separate from `review` because QA children execute the software (E2E walks, differential tests, instrumentation) while reviewers read artifacts. `security` folded into `review` (it appeared as a review lens, not a distinct worker profile). Fixed key set with strict rejection of unknown keys matches the existing config parsers' strictness and catches typos.

**D4 — `task:` resolves through the existing plan resolver.** `task:<category>` is expanded before `resolveRuntimePlan` into the category's authenticated candidates: full ordered fallback chain for ordinary spawns, first candidate only for worktree spawns (existing rule: no fallbacks with worktrees). Alternative — resolution-time scoring/routing logic — rejected: ordering is the operator's judgment captured by `/subagents-init` plus hand edits; the extension should stay deterministic and explainable.

**D5 — Guidance renders preferences; the LLM still owns judgment calls.** Configured categories render as ordered shortlists inside the existing routing-guidelines block, replacing the generic tier prose when present. The family-independence review rule stays in prose because only the parent knows the authoring model. This keeps both entry points consistent: same config, one deterministic (`task:`), one advisory (rendered guidance).

**D6 — `/subagents-init` is a prompt-driven command, not native TS ranking.** The command instructs the running agent to: dump the authenticated registry (cost, context, reasoning), research current task-fit with available web-search tooling, and write the draft through a validation seam that round-trips the config file and replaces only `models.tasks` + metadata. Alternative — hardcoded native heuristics — rejected as the primary path: "which model is best for coding right now" is exactly the evolving world-knowledge an LLM with search handles better than shipped code; registry-only heuristics remain the stated degraded path. The write seam is native and tested so the LLM cannot corrupt unrelated config sections.

**D7 — Generation metadata.** The written section carries `generatedAt` and `method` (`research` | `registry-only`) so future staleness surfacing is possible without another schema change.

## Future direction: loop templates (not in this change)

Recurring orchestrations observed in history are loop shapes, not agent shapes: measure→change→evaluate optimization loops, throwaway differential-test-then-PR-comment, E2E QA with instrumentation then PR-comment, wave-parallel decomposition into release PRs with per-PR QA, and same-spec competing builders across model families with a pick-the-best synthesis. A follow-up feature could define these as loop templates — named, reusable loop definitions living beside `models` in the same config file (a sibling `loops` key), each declaring its stages, the task categories (and therefore models via `models.tasks`) each stage uses, and its termination/report contract. This change only reserves the namespace: config parsing must reject unknown top-level keys *except* by explicit allowlist, so adding `loops` later is additive. No loop execution semantics are designed here.

## Risks / Trade-offs

- [Stale preferences mislead routing] → generation metadata records date and method; re-running `/subagents-init` is cheap. Staleness warnings are deliberately deferred.
- [Research quality varies by provider/search availability] → the command must label registry-only drafts, and the user reviews the table before relying on it.
- [Breaking config move strands existing users] → major version bump, README/RELEASING migration note, and `/subagents-init` as the one-command re-setup.
- [Prompt-driven init writes config] → the native write seam validates the schema and preserves unrelated keys; the LLM never writes the file directly.
- [`task:` categories in worktree spawns lose fallback resilience] → consistent with the existing "no fallbacks with worktrees" rule; the error path names authenticated alternatives.

## Open Questions

None.
