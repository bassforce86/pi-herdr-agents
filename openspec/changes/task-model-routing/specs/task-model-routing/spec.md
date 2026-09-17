## Purpose

Lets operators encode which models are currently best for each kind of subagent task in configuration, so orchestrators pick from curated, up-to-date shortlists — or resolve a task category deterministically — instead of relying on generic tier prose and stale markdown.

## ADDED Requirements

### Requirement: Task-category model preferences are configurable

The configuration SHALL support a `models.tasks` object mapping task categories to ordered candidate lists of exact `provider/model-id` references, and a sibling `models.tasksMeta` object with `generatedAt` (ISO-8601 string) and `method` (`"research"` or `"registry-only"`). Supported categories are `coding`, `review`, `recon`, `qa`, `architecture`, and `docs`. Configuration parsing SHALL reject unknown keys inside `models.tasks` (naming the offending key and listing supported categories), empty candidate lists, non-string or empty candidates, and invalid `models.tasksMeta` values. An empty `models.tasks` object SHALL be treated the same as an absent one. The existing rejection of unknown `models` keys SHALL be updated to allowlist `tasks` and `tasksMeta`.

#### Scenario: Valid task preferences load

- **WHEN** `models.tasks.coding` is `["opencode-go/glm-5.3", "openai-codex/gpt-5.6-terra"]` and `models.tasksMeta` is `{"generatedAt": "2026-09-17T00:00:00Z", "method": "research"}`
- **THEN** the configuration loads and the coding category preserves that order

#### Scenario: Unknown category rejected

- **WHEN** `models.tasks` contains a key `debugging`
- **THEN** configuration loading fails with an error naming `models.tasks.debugging` and listing the supported categories

#### Scenario: Invalid metadata rejected

- **WHEN** `models.tasksMeta.method` is `"guesswork"`
- **THEN** configuration loading fails with an error naming `models.tasksMeta.method` and the allowed values

### Requirement: Configured preferences render into subagent routing guidance

When `models.tasks` is configured and non-empty, the routing guidance injected into the `subagent` tool SHALL render each configured category's ordered candidates restricted to authenticated models, alongside the live authenticated catalog. The rendered guidance SHALL state that for review spawns the parent must skip shortlist candidates sharing the authoring model's provider family, choosing an exact `provider/model-id` when an author family is known, and SHALL NOT claim the extension enforces this. When `models.tasks` is absent or empty, guidance SHALL remain the current generic tier text.

#### Scenario: Preferences appear in guidance

- **WHEN** `models.tasks.coding` lists two authenticated models and one unauthenticated model
- **THEN** the subagent guidance lists the coding category with the two authenticated candidates in configured order and omits the unauthenticated one

#### Scenario: No preferences configured

- **WHEN** `models.tasks` is not present in configuration
- **THEN** the routing guidance is unchanged from the generic tier guidance

### Requirement: Task-category references resolve deterministically

The `subagent` tool's `model` parameter SHALL accept `task:<category>` only as the entire parameter value. The category name SHALL be trimmed of surrounding whitespace and matched case-insensitively. Expansion SHALL happen before fallback parsing and before runtime-plan resolution: for a non-worktree spawn the reference expands to the category's ordered authenticated candidates as a fallback chain; for a worktree spawn it expands to the first authenticated candidate only, applied before the existing no-fallbacks-with-worktrees guard so that guard is not triggered. Resolution SHALL fail with a clear error when the value mixes `task:` with other comma-separated candidates, when the category is empty, unknown, or not configured, or when the category has no authenticated candidate; each error SHALL list the configured categories or authenticated alternatives. `task:` references SHALL NOT be accepted in agent frontmatter `model`, `models.agents.*`, or `models.default`, and those sources SHALL reject them with a clear error.

#### Scenario: Deterministic coding resolution

- **WHEN** a subagent is spawned with `model: "task:coding"` and `models.tasks.coding` starts with an authenticated model
- **THEN** the child launches with that model and the remaining authenticated candidates as ordered fallbacks

#### Scenario: Worktree spawn uses a single candidate

- **WHEN** a worktree subagent is spawned with `model: "task:coding"`
- **THEN** the child launches with only the first authenticated candidate, no fallback list, and no fallback-guard error

#### Scenario: Mixed list rejected

- **WHEN** a subagent is spawned with `model: "task:coding, openai-codex/gpt-5.6-terra"`
- **THEN** the spawn fails with an error stating `task:` references must be the entire model value

#### Scenario: Unconfigured category fails

- **WHEN** a subagent is spawned with `model: "task:qa"` and `models.tasks` has no `qa` entry
- **THEN** the spawn fails with an error naming `qa` and listing the configured categories

#### Scenario: Frontmatter task reference rejected

- **WHEN** an agent definition's frontmatter sets `model: task:coding`
- **THEN** the spawn fails with an error stating `task:` references are only valid in the `subagent` tool's `model` parameter

### Requirement: Existing model selection behavior is preserved

Exact `provider/model-id` references, comma-separated fallback lists of exact references, per-agent config defaults, frontmatter model pins, and parent-runtime inheritance when `model` is omitted SHALL behave exactly as before this change. Candidate authentication for `task:` resolution SHALL be checked against the live registry at spawn time, not at config-generation time.

#### Scenario: Exact reference unchanged

- **WHEN** a subagent is spawned with `model: "xai-auth/grok-4.6"`
- **THEN** resolution behaves identically to the pre-change contract

#### Scenario: Authentication revoked after generation

- **WHEN** every candidate in `models.tasks.coding` has lost registry authentication since the config was generated
- **THEN** `model: "task:coding"` fails at spawn time with a no-authenticated-candidate error listing authenticated alternatives
