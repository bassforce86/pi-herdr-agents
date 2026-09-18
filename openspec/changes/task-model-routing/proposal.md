## Why

Orchestrators pick subagent models from generic fast/mid/frontier prose, so task-fit and cost knowledge ("GLM is currently strong and cheap for coding") lives only in the operator's head and in hand-edited markdown that rots as new models ship. Session-history evidence (1,066 spawns): 13% of spawns omitted `model` entirely and silently inherited the parent, malformed references such as `openai-codex` or `gpt-5.6-terra` (missing provider) slipped through, and models the operator considers best-value for coding were selected 13 times out of 1,066. Separately, the extension's `config.json` lives inside the installed npm package directory, so package upgrades clobber user configuration — an anti-pattern relative to the Pi convention that durable extension config lives under the Pi agent directory.

## What Changes

- **BREAKING**: relocate the user configuration file from the installed package root to `$PI_CODING_AGENT_DIR/herdr-agents/config.json` (default `~/.pi/agent/herdr-agents/config.json`). No legacy package-root fallback; the shipped `config.json.example` remains the packaged per-section default when no user config exists. All six config readers (models, roles, panes, supervision, persistent caps, status) move together through one shared path seam.
- Add a `models.tasks` section to the config: ordered candidate model lists per task category (`coding`, `review`, `recon`, `qa`, `architecture`, `docs`), with generation metadata in a sibling `models.tasksMeta` object (`generatedAt`, `method`).
- Render configured task preferences into the live authenticated-model catalog guidance injected into the `subagent` tool, so the parent LLM picks from a curated shortlist instead of generic tier prose. Rendered review guidance directs the parent to skip the authoring model's provider family and use an exact ID for reviews when the author is known.
- Accept `task:<category>` as the entire value of the `subagent` tool's `model` parameter: the extension deterministically expands it to the category's authenticated candidates (fallback chain for ordinary spawns, first candidate for worktree spawns), with clear errors for mixed lists, unknown or unconfigured categories, and fully unauthenticated lists.
- Add a `/subagents-init` command that inspects the authenticated model registry, performs web research on current model task-fit when search tooling is available (registry-only ranking as the labeled degraded path), and writes a drafted `models.tasks` config through a native validated, seeded, atomic, section-scoped write seam, then reports the draft with reload guidance.
- Stop shipping `openspec/` planning artifacts in the npm tarball (pre-existing packaging leak surfaced by this change's review).
- Record future direction (design-level note, not implemented): loop templates — reusable orchestration loop definitions (for example measure→change→evaluate optimization, differential-test-and-report, E2E QA-and-report, wave-parallel release PRs, competing multi-model builders) that would live beside `models` in the same config file as an additive `loops` section.

## Capabilities

### New Capabilities

- `global-config`: location, precedence, per-section fallback, and error behavior of the extension's durable user configuration under `$PI_CODING_AGENT_DIR/herdr-agents/`, replacing package-root `config.json` for all six readers.
- `task-model-routing`: task-category model preferences (`models.tasks` + `models.tasksMeta`), their rendering into subagent routing guidance, and deterministic `task:<category>` resolution in the `subagent` tool.
- `model-config-init`: the `/subagents-init` command that generates and updates the task-preference configuration from the authenticated registry plus optional web research, through a seeded, atomic, section-scoped write seam.

### Modified Capabilities

None (no existing specs).

## Impact

- `pi-extension/subagents/model-config.ts`, `role-config.ts`, `pane-config.ts`, `supervision-config.ts`, `persistent-config.ts`, `status.ts` — shared config path resolution moves to the agent directory; `models` parser gains `tasks`/`tasksMeta`.
- `pi-extension/subagents/runtime-routing.ts` — catalog guidance rendering and `task:<category>` expansion ahead of fallback parsing and the worktree guard.
- `pi-extension/subagents/index.ts` — `subagent` tool `model` parameter description, routing guidelines, `/subagents-init` command registration.
- `test/test.ts`, `test/runtime-routing.test.ts` — config-resolution, task-routing, catalog-rendering, and write-seam coverage.
- Packaging: exclude `openspec/` from the npm tarball.
- Docs: `README.md` (configuration location and migration, tool parameters, `/subagents-init`, `models.tasks` sample), `AGENTS.md` (local config references), `CONTEXT.md` (task-category and loop-template vocabulary), `docs/adr/0002` and `docs/adr/0003` package-local config mentions, `pi-extension/subagents/plan-skill.md`, `config.json.example` (unchanged content contract: valid JSON, no `models.tasks`).
- Release: **major version bump** (config location and precedence are breaking).
