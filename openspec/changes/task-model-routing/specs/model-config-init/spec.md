## Purpose

Provides a command that generates and refreshes the task-category model preferences from the live authenticated registry, optionally informed by current web research, so operators keep model taste current without hand-editing markdown or config.

## ADDED Requirements

### Requirement: An init command drafts task preferences from live evidence

The extension SHALL provide a `/subagents-init` command that inspects the authenticated model registry (provider, model ID, cost, context window, reasoning support — read from the registry itself, not from the rendered catalog string, which does not include cost), researches current task-fit via available web-search tooling, and produces a drafted `models.tasks` configuration covering every supported task category that has at least one authenticated candidate. When web research tooling is unavailable or fails, the command SHALL fall back to registry-only ranking and record `method: "registry-only"`. Candidate ordering is agent judgment and is not unit-tested; the tested contract is the write seam's validation (schema, exact references, authenticated-at-write-time candidates, ordered non-empty lists, metadata enum).

#### Scenario: Research-informed draft

- **WHEN** `/subagents-init` runs with web search available
- **THEN** the written `models.tasksMeta.method` is `"research"` and the summary states research informed the ranking

#### Scenario: Registry-only degraded path

- **WHEN** `/subagents-init` runs without working web search
- **THEN** a draft is still produced, `models.tasksMeta.method` is `"registry-only"`, and the summary states that research was unavailable

### Requirement: The write seam is section-scoped, seeded, and atomic

`/subagents-init` SHALL write through a native validated seam targeting `<agent-dir>/herdr-agents/config.json` (per the global-config capability), creating the directory when absent. When the file does not exist, the seam SHALL seed it from the packaged `config.json.example` before applying changes, so every configuration section — including status — remains loadable afterward. The seam SHALL replace only `models.tasks` and `models.tasksMeta`, preserving all other keys deep-equal (other `models` keys, roles, panes, supervision, persistent caps, status). Writes SHALL be atomic (write to a temporary file, then rename) and SHALL re-read the current file contents immediately before modifying, so concurrent edits to other sections are not lost. The seam SHALL never write inside the installed package directory, and the language model never edits the file directly.

#### Scenario: Fresh init keeps the extension loadable

- **WHEN** `/subagents-init` runs with no existing user config
- **THEN** the written file contains the example-seeded sections plus `models.tasks`, and every section loader — including status — parses it successfully

#### Scenario: Existing config preserved

- **WHEN** the config file already contains `models.default` and `supervision` settings and `/subagents-init` runs
- **THEN** the updated file contains the new `models.tasks` and `models.tasksMeta` while `models.default` and `supervision` are deep-equal unchanged

#### Scenario: Invalid candidate rejected by the seam

- **WHEN** the drafted config contains a candidate absent from the authenticated registry
- **THEN** the seam rejects the write with an error naming the candidate and no file change occurs

### Requirement: The draft is presented for review with reload guidance

After writing, the command SHALL present the resulting category-to-candidates table and generation metadata to the user so the draft can be reviewed and hand-edited. Because configuration is loaded at extension startup, the summary SHALL state that a reload (`/reload` or a new session) is required before `task:<category>` resolution and rendered guidance use the new values.

#### Scenario: Summary after generation

- **WHEN** `/subagents-init` completes
- **THEN** the user sees each category with its ordered candidates, the generation date and method, and the reload instruction
