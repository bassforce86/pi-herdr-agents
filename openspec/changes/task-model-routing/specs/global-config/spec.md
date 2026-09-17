## Purpose

Defines where the extension's durable user configuration lives, how it is resolved, and how configuration errors surface, following the Pi convention that extension config survives package upgrades under `~/.pi/agent/`.

## ADDED Requirements

### Requirement: User configuration is read from the Pi agent directory

The extension SHALL read user configuration from `~/.pi/agent/herdr-agents/config.json`. All configuration sections (models, roles, panes, supervision, persistent caps) SHALL resolve from this single file. The extension SHALL NOT read a `config.json` from the installed package root; this is a breaking change with no legacy fallback.

#### Scenario: User config exists in the agent directory

- **WHEN** `~/.pi/agent/herdr-agents/config.json` exists and is valid
- **THEN** every configuration section resolves from that file

#### Scenario: Legacy package-root config is ignored

- **WHEN** a `config.json` exists at the installed package root and no file exists at `~/.pi/agent/herdr-agents/config.json`
- **THEN** the package-root file is not read and the extension uses the packaged example defaults

### Requirement: Packaged example defaults apply when no user config exists

When `~/.pi/agent/herdr-agents/config.json` does not exist, the extension SHALL fall back to the packaged `config.json.example` defaults, and sections that currently tolerate a missing file (such as models) SHALL continue to behave as unconfigured rather than erroring.

#### Scenario: Fresh install without user config

- **WHEN** no file exists at `~/.pi/agent/herdr-agents/config.json`
- **THEN** the extension loads packaged example defaults and starts without error

### Requirement: Invalid configuration fails with the resolved path

When the user configuration file exists but contains invalid JSON or an invalid schema, the extension SHALL fail with an error that names the resolved file path and the specific problem.

#### Scenario: Invalid JSON in user config

- **WHEN** `~/.pi/agent/herdr-agents/config.json` contains malformed JSON
- **THEN** the error message includes the `~/.pi/agent/herdr-agents/config.json` path and a JSON parse detail
