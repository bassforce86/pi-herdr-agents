## Context

See proposal.md — Why. Current state that shapes the approach:

- Six config readers (`model-config.ts`, `role-config.ts`, `pane-config.ts`, `supervision-config.ts`, `persistent-config.ts`, `status.ts`) each derive `PACKAGE_ROOT` independently and read `config.json` / `config.json.example` from the installed package root. `status.ts` additionally hard-requires a `status` section: `parseStatusConfig` throws when `status` is missing, so any user config lacking that section breaks extension load.
- The extension already resolves the Pi agent directory as `$PI_CODING_AGENT_DIR ?? ~/.pi/agent` (`index.ts` `getAgentConfigDir`), and integration tests isolate through `PI_CODING_AGENT_DIR`.
- `runtime-routing.ts` builds a live authenticated model catalog (`buildAuthenticatedModelCatalog`) rendering provider, model ID, reasoning/thinking levels, input kinds, context window, and max output. Cost is stored on `RoutingModel` but not rendered; cost-aware ranking must read the registry, not the catalog string.
- Model resolution (`resolveRuntimePlan`) validates exact `provider/model-id` references against the registry and checks authentication. `parseModelFallbacks` splits the entire `model` string on commas before exact-reference parsing, and worktree launches reject fallback lists.
- `models` config parsing rejects unknown keys under `models` today; `loadModelConfig` treats a missing file as unconfigured and never reads the example.
- Session-history evidence for the task taxonomy: 1,066 spawns — reviewer 52%, worker 32%, scout 10%, researcher 4%; name tokens dominated by review/build/research/test; 15% worktree usage.

## Goals / Non-Goals

**Goals:**

- One shared config-path resolution used by every reader — all six — pointing at `$PI_CODING_AGENT_DIR/herdr-agents/config.json` (default `~/.pi/agent/herdr-agents/config.json`).
- `models.tasks` as the single source of truth consumed by both the rendered guidance (LLM chooses) and `task:<category>` resolution (extension chooses).
- `task:` resolution layered onto the existing `resolveRuntimePlan` validation path, not a parallel resolver.
- A config schema that can gain a sibling `loops` section later without migration.

**Non-Goals:**

- No per-project config override; per-repo pinning stays in agent frontmatter and per-agent config keys.
- No automatic config refresh, staleness enforcement, or background re-research; `/subagents-init` is explicitly user-invoked.
- No change to review-independence enforcement: it stays a guidance-level rule for the parent LLM, because deterministic resolution cannot know which model authored the material under review.
- No in-session hot reload of config: existing load-at-startup semantics stay; the init command tells the user to reload.
- No loop templates in this change (see Future direction).

## Decisions

**D1 — Single shared config module.** Extract one shared path/resolution seam that resolves the user config file at `join(getAgentConfigDir(), "herdr-agents", "config.json")` — reusing the existing `$PI_CODING_AGENT_DIR ?? ~/.pi/agent` resolution — with the packaged `config.json.example` as the per-section fallback where a section reads it today, and route all six readers (including `status.ts`) through it. The models section keeps its current missing-file-as-unconfigured semantics and still never reads the example. Alternative — patching six `PACKAGE_ROOT` constants — rejected: it preserves the duplication that caused the anti-pattern.

**D2 — Clean break, no legacy fallback.** The package-root `config.json` is never consulted by any reader. Alternative — precedence chain with deprecation warning — rejected by the user: the old location is a full anti-pattern, and `/subagents-init` regenerates the important section in one command. Consequence: major version bump; RELEASING/README/ADR references to package-local config are updated with the migration note (move the file manually or re-run init).

**D3 — Taxonomy from observed usage.** Categories `coding`, `review`, `recon`, `qa`, `architecture`, `docs` — chosen from spawn-history frequency rather than a priori tiers. Operational mapping: `recon` → scout roles, `architecture` → planner/hard-diagnosis roles, `coding` → worker/build/fix roles, `review` → reviewer roles, `qa` → E2E/differential-test/instrumentation runners (they execute the software; reviewers read artifacts), `docs` → documentation-focused worker tasks. `security` folded into `review` (it appeared as a review lens, not a distinct worker profile). Fixed key set with strict rejection of unknown keys matches the existing config parsers' strictness and catches typos.

**D4 — `task:` resolves through the existing plan resolver, whole-value only.** `task:<category>` is accepted only as the entire `model` value (trimmed, case-insensitive category), never as one token of a comma list and never in frontmatter, `models.agents.*`, or `models.default`. Expansion happens before `parseModelFallbacks` and before the worktree fallback guard: ordinary spawns expand to the category's authenticated candidates as a fallback chain; worktree spawns expand to the first authenticated candidate so the no-fallbacks-with-worktrees guard is not triggered. Alternative — allowing `task:` tokens inside mixed comma lists — rejected: it complicates the splitter contract for no observed need. Alternative — resolution-time scoring — rejected: ordering is the operator's judgment captured by `/subagents-init` plus hand edits; the extension stays deterministic and explainable.

**D5 — Guidance renders preferences; the LLM still owns judgment calls.** Configured categories render as ordered shortlists inside the existing routing-guidelines block, replacing the generic tier prose when present. Family independence for review cannot be enforced deterministically (only the parent knows the authoring model), so the rendered guidance explicitly instructs: for review spawns where an author family is known, do not use `task:review`; pick an exact ID from the review shortlist excluding the author's family. `plan-skill.md` and `skills/orchestrate` keep their exact-ID family-diversity rules; `task:` categories are recommended there only for non-review roles.

**D6 — `/subagents-init` is a prompt-driven command with a native validated write seam.** The command instructs the running agent to: dump the authenticated registry (cost, context, reasoning — from the registry object, not the catalog string), research current task-fit with available web-search tooling, and submit the draft to a native seam. The seam owns correctness: schema validation, exact-reference and authenticated-candidate checks, seeding a missing file from `config.json.example` (so status and every other section stay loadable), section-scoped replacement of `models.tasks`/`models.tasksMeta` only, re-read-before-modify, and atomic temp-file-rename writes. Candidate *ordering* is agent judgment (research-informed or registry-only heuristics such as cost and context window) and is deliberately not unit-tested; the seam's guarantees are. Alternative — hardcoded native ranking — rejected as the primary path: current task-fit is evolving world knowledge an LLM with search handles better than shipped code.

**D7 — Generation metadata.** `models.tasksMeta` (`generatedAt` ISO-8601, `method` `"research" | "registry-only"`) is a sibling of `models.tasks`, allowlisted in the `models` parser, so future staleness surfacing is possible without another schema change. Keeping metadata out of `models.tasks` preserves the strict category-only key rule there.

**D8 — Reload semantics stay explicit.** All config loads remain at-startup; `task:` resolution and guidance rendering read the startup snapshot. The init summary tells the user to `/reload`. Alternative — in-memory hot swap after init — rejected for v1: it adds cross-module mutable state for a rare operation with a one-command remedy.

## Future direction: loop templates (not in this change)

Recurring orchestrations observed in history are loop shapes, not agent shapes: measure→change→evaluate optimization loops, throwaway differential-test-then-PR-comment, E2E QA with instrumentation then PR-comment, wave-parallel decomposition into release PRs with per-PR QA, and same-spec competing builders across model families with a pick-the-best synthesis. A follow-up feature could define these as loop templates — named, reusable loop definitions living beside `models` in the same config file (a sibling `loops` key), each declaring its stages, the task categories (and therefore models via `models.tasks`) each stage uses, and its termination/report contract. Because the config parsers validate sections independently and ignore unrelated top-level keys, adding `loops` later is purely additive; no reservation mechanism is needed and none is added here. No loop execution semantics are designed in this change.

## Risks / Trade-offs

- [Stale preferences mislead routing] → `models.tasksMeta` records date and method; re-running `/subagents-init` is cheap. Staleness warnings are deliberately deferred.
- [Research quality varies by provider/search availability] → `method` labels registry-only drafts, and the user reviews the table before relying on it.
- [Breaking config move strands existing users] → major version bump, README/RELEASING/ADR migration note, and `/subagents-init` as the one-command re-setup.
- [Prompt-driven init writes config] → the native seam validates the schema, seeds missing files from the example, preserves unrelated keys, and writes atomically; the LLM never writes the file directly.
- [Concurrent sessions edit the config] → re-read-before-modify plus atomic rename bounds the loss to same-section last-writer-wins, which the spec documents.
- [`task:` categories in worktree spawns lose fallback resilience] → consistent with the existing "no fallbacks with worktrees" rule; the error path names authenticated alternatives.
- [`task:review` bypasses family independence if misused] → guidance and plan-skill explicitly direct exact-ID selection for reviews when an author family is known.

## Open Questions

None.
