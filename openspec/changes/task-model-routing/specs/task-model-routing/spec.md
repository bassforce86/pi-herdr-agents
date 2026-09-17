## Purpose

Lets operators encode which models are currently best for each kind of subagent task in configuration, so orchestrators pick from curated, up-to-date shortlists — or resolve a task category deterministically — instead of relying on generic tier prose and stale markdown.

## ADDED Requirements

### Requirement: Task-category model preferences are configurable

The configuration SHALL support a `models.tasks` object mapping task categories to ordered candidate lists of exact `provider/model-id` references. Supported categories are `coding`, `review`, `recon`, `qa`, `architecture`, and `docs`. Configuration parsing SHALL reject unknown category keys, empty candidate lists, and non-string or empty candidates, naming the offending key in the error.

#### Scenario: Valid task preferences load

- **WHEN** `models.tasks.coding` is `["opencode-go/glm-5.3", "openai-codex/gpt-5.6-terra"]`
- **THEN** the configuration loads and the coding category preserves that order

#### Scenario: Unknown category rejected

- **WHEN** `models.tasks` contains a key `debugging`
- **THEN** configuration loading fails with an error naming `models.tasks.debugging` and listing the supported categories

### Requirement: Configured preferences render into subagent routing guidance

When `models.tasks` is configured, the routing guidance injected into the `subagent` tool SHALL render each configured category's ordered candidates restricted to authenticated models, alongside the live authenticated catalog. The rendered review guidance SHALL retain the family-independence rule: candidates sharing the authoring model's provider family must be skipped for review. When `models.tasks` is absent, guidance SHALL remain the current generic tier text.

#### Scenario: Preferences appear in guidance

- **WHEN** `models.tasks.coding` lists two authenticated models and one unauthenticated model
- **THEN** the subagent guidance lists the coding category with the two authenticated candidates in configured order and omits the unauthenticated one

#### Scenario: No preferences configured

- **WHEN** `models.tasks` is not present in configuration
- **THEN** the routing guidance is unchanged from the generic tier guidance

### Requirement: Task-category references resolve deterministically

The `subagent` tool's `model` parameter SHALL accept `task:<category>`. For a non-worktree spawn, the reference SHALL resolve to the category's ordered authenticated candidates as a fallback chain. For a worktree spawn, it SHALL resolve to the first authenticated candidate only. Resolution SHALL fail with a clear error when the category is not configured, is unknown, or has no authenticated candidate; the error SHALL list configured categories or authenticated alternatives.

#### Scenario: Deterministic coding resolution

- **WHEN** a subagent is spawned with `model: "task:coding"` and `models.tasks.coding` starts with an authenticated model
- **THEN** the child launches with that model and the remaining authenticated candidates as ordered fallbacks

#### Scenario: Worktree spawn uses a single candidate

- **WHEN** a worktree subagent is spawned with `model: "task:coding"`
- **THEN** the child launches with only the first authenticated candidate and no fallback list

#### Scenario: Unconfigured category fails

- **WHEN** a subagent is spawned with `model: "task:qa"` and `models.tasks` has no `qa` entry
- **THEN** the spawn fails with an error naming `qa` and listing the configured categories

### Requirement: Existing model selection behavior is preserved

Exact `provider/model-id` references, comma-separated fallback lists, per-agent config defaults, frontmatter model pins, and parent-runtime inheritance when `model` is omitted SHALL behave exactly as before this change.

#### Scenario: Exact reference unchanged

- **WHEN** a subagent is spawned with `model: "xai-auth/grok-4.6"`
- **THEN** resolution behaves identically to the pre-change contract
