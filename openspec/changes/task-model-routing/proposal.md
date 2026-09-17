## Why

Orchestrators pick subagent models from generic fast/mid/frontier prose, so task-fit and cost knowledge ("GLM is currently strong and cheap for coding") lives only in the operator's head and in hand-edited markdown that rots as new models ship. Session-history evidence (1,066 spawns): 13% of spawns omitted `model` entirely and silently inherited the parent, malformed references such as `openai-codex` or `gpt-5.6-terra` (missing provider) slipped through, and models the operator considers best-value for coding were selected 13 times out of 1,066. Separately, the extension's `config.json` lives inside the installed npm package directory, so package upgrades clobber user configuration — an anti-pattern relative to the Pi convention that durable extension config lives under `~/.pi/agent/`.

## What Changes

- **BREAKING**: relocate the user configuration file from the installed package root to `~/.pi/agent/herdr-agents/config.json`. No legacy package-root fallback; the shipped `config.json.example` remains the packaged default when no user config exists. All four config readers (models, roles, panes, supervision) move together.
- Add a `models.tasks` section to the config: ordered candidate model lists per task category (`coding`, `review`, `recon`, `qa`, `architecture`, `docs`).
- Render configured task preferences into the live authenticated-model catalog guidance injected into the `subagent` tool, so the parent LLM picks from a curated shortlist instead of generic tier prose. Review guidance preserves the family-independence rule: candidates in the authoring model's provider/family are skipped.
- Accept `task:<category>` in the `subagent` tool's `model` parameter: the extension deterministically resolves it to the first authenticated candidate in that category's ordered list, with clear errors for unknown categories and unauthenticated lists.
- Add a `/subagents-init` command that inspects the authenticated model registry (provider, cost, context window, reasoning support), performs web research on current model task-fit when search tooling is available (registry-only heuristics as the degraded path), and writes a drafted `models.tasks` config with generation metadata for the user to review.
- Record future direction (design-level note, not implemented): loop templates — reusable orchestration loop definitions (for example measure→change→evaluate optimization, differential-test-and-report, E2E QA-and-report, wave-parallel release PRs, competing multi-model builders) that would live beside `models` in the same config file. The `models.tasks` schema must not preclude adding a sibling `loops` section later.

## Capabilities

### New Capabilities

- `global-config`: location, precedence, and error behavior of the extension's durable user configuration under `~/.pi/agent/herdr-agents/`, replacing package-root `config.json`.
- `task-model-routing`: task-category model preferences (`models.tasks`), their rendering into subagent routing guidance, and deterministic `task:<category>` resolution in the `subagent` tool.
- `model-config-init`: the `/subagents-init` command that generates and updates the `models.tasks` configuration from the authenticated registry plus optional web research.

### Modified Capabilities

None (no existing specs).

## Impact

- `pi-extension/subagents/model-config.ts`, `role-config.ts`, `pane-config.ts`, `supervision-config.ts`, `persistent-config.ts` — shared config path resolution moves to `~/.pi/agent/herdr-agents/config.json`.
- `pi-extension/subagents/runtime-routing.ts` — catalog guidance rendering and `task:<category>` resolution.
- `pi-extension/subagents/index.ts` — `subagent` tool `model` parameter description, routing guidelines, new `/subagents-init` command registration.
- `test/test.ts` — config-resolution, task-routing, and catalog-rendering coverage.
- Docs: `README.md` (configuration section, tool parameters, command), `AGENTS.md` (local config references), `CONTEXT.md` (task category and loop-template vocabulary), `config.json.example`.
- Release: **major version bump** (config location and precedence are breaking).
