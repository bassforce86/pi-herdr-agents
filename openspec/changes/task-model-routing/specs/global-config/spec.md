## Purpose

Defines where the extension's durable user configuration lives, how it is resolved, and how configuration errors surface, following the Pi convention that extension config survives package upgrades under the Pi agent directory.

## ADDED Requirements

### Requirement: User configuration is read from the Pi agent directory

The extension SHALL read user configuration from `<agent-dir>/herdr-agents/config.json`, where `<agent-dir>` is `$PI_CODING_AGENT_DIR` when set and `~/.pi/agent` otherwise. All six configuration sections (models, roles, panes, supervision, persistent caps, status) SHALL resolve from this single file through one shared path-resolution seam. The extension SHALL NOT read a `config.json` from the installed package root; this is a breaking change with no legacy fallback.

#### Scenario: User config exists in the agent directory

- **WHEN** `~/.pi/agent/herdr-agents/config.json` exists and is valid and `PI_CODING_AGENT_DIR` is unset
- **THEN** every configuration section, including status, resolves from that file

#### Scenario: Custom agent directory is respected

- **WHEN** `PI_CODING_AGENT_DIR` is set to a custom directory
- **THEN** user configuration resolves from `$PI_CODING_AGENT_DIR/herdr-agents/config.json`

#### Scenario: Legacy package-root config is ignored

- **WHEN** a `config.json` exists at the installed package root and no user config file exists
- **THEN** the package-root file is not read by any section, including status

### Requirement: Fallback behavior without a user config is unchanged per section

When the user configuration file does not exist, each section SHALL keep its current fallback semantics: sections that read the packaged `config.json.example` (roles, panes, supervision, persistent caps, status) SHALL continue to do so, and the models section SHALL behave as unconfigured without reading the example. The packaged `config.json.example` SHALL remain valid JSON with no comment syntax and SHALL NOT contain a `models.tasks` section.

#### Scenario: Fresh install without user config

- **WHEN** no user config file exists
- **THEN** the extension starts without error, example-backed sections load their defaults, and model selection behaves as unconfigured

#### Scenario: Packaged example parses

- **WHEN** the packaged `config.json.example` is parsed with a strict JSON parser
- **THEN** parsing succeeds

### Requirement: Invalid configuration fails with the resolved path

When the user configuration file exists but contains invalid JSON or an invalid section schema, the affected section loader SHALL fail with an error that names the resolved user config path and the specific problem.

#### Scenario: Invalid JSON in user config

- **WHEN** the user config file contains malformed JSON
- **THEN** the error message includes the resolved `<agent-dir>/herdr-agents/config.json` path and a JSON parse detail
