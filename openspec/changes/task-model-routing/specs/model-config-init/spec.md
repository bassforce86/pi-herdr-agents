## Purpose

Provides a command that generates and refreshes the task-category model preferences from the live authenticated registry, optionally informed by current web research, so operators keep model taste current without hand-editing markdown or config.

## ADDED Requirements

### Requirement: An init command drafts task preferences from live evidence

The extension SHALL provide a `/subagents-init` command that inspects the authenticated model registry (provider, model ID, cost, context window, reasoning support), researches current task-fit via available web-search tooling, and produces a drafted `models.tasks` configuration covering every supported task category that has at least one suitable authenticated model. When web research tooling is unavailable or fails, the command SHALL fall back to registry-only heuristics and state that the draft is registry-only.

#### Scenario: Research-informed draft

- **WHEN** `/subagents-init` runs with web search available
- **THEN** the draft orders candidates using registry data plus researched task-fit, and the summary states research informed the ranking

#### Scenario: Registry-only degraded path

- **WHEN** `/subagents-init` runs without working web search
- **THEN** a draft is still produced from registry heuristics and the summary states that research was unavailable

### Requirement: The command writes only its own config section

`/subagents-init` SHALL write the draft to `~/.pi/agent/herdr-agents/config.json`, creating the directory and file when absent. It SHALL replace only the `models.tasks` section plus generation metadata (generation date and method), and SHALL preserve every other key in the file byte-for-byte semantically (other `models` keys, roles, panes, supervision, persistent caps). It SHALL never write inside the installed package directory.

#### Scenario: Existing config preserved

- **WHEN** the config file already contains `models.default` and `supervision` settings and `/subagents-init` runs
- **THEN** the updated file contains the new `models.tasks` and metadata while `models.default` and `supervision` are unchanged

### Requirement: The draft is presented for review

After writing, the command SHALL present the resulting category-to-candidates table and generation metadata to the user so the draft can be reviewed and hand-edited. It SHALL only report candidates that exist in the authenticated registry.

#### Scenario: Summary after generation

- **WHEN** `/subagents-init` completes
- **THEN** the user sees each category with its ordered candidates, the generation date, and whether research or registry-only heuristics produced it
