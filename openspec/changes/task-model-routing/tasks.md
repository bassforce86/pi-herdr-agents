## 1. Global config relocation (BREAKING)

- [ ] 1.1 Add a shared config-path module resolving `~/.pi/agent/herdr-agents/config.json` with packaged `config.json.example` fallback, and verify with unit tests covering existing file, missing file, and error-path naming the resolved path
- [ ] 1.2 Route `model-config.ts`, `role-config.ts`, `pane-config.ts`, `supervision-config.ts`, and `persistent-config.ts` through the shared module, delete per-reader `PACKAGE_ROOT` config paths, and verify `npm test` passes with no reader reading the package root (test asserts package-root `config.json` is ignored)
- [ ] 1.3 Update `README.md`, `AGENTS.md`, and `RELEASING.md` for the new location, the removed package-root contract, and the manual-move/re-init migration note, and verify `npm run format:check` passes

## 2. models.tasks config schema

- [ ] 2.1 Extend the models config parser with a strict `models.tasks` object (categories `coding`, `review`, `recon`, `qa`, `architecture`, `docs`; ordered non-empty string candidate lists; `generatedAt`/`method` metadata), rejecting unknown category keys with an error listing supported categories, and verify with parser unit tests for valid, unknown-key, empty-list, and non-string cases
- [ ] 2.2 Update `config.json.example` with a commented `models.tasks` sample and verify `npm pack --dry-run` still includes the example file

## 3. Guidance rendering

- [ ] 3.1 Render configured task categories (authenticated candidates only, configured order) into `buildSubagentRoutingGuidelines`/catalog output, preserving generic tier text when `models.tasks` is absent and the family-independence review rule always, and verify with unit tests asserting rendered guidance for configured, partially-authenticated, and unconfigured cases

## 4. task:<category> resolution

- [ ] 4.1 Expand `task:<category>` in the `subagent` tool's `model` parameter into the category's authenticated candidates before `resolveRuntimePlan` (full fallback chain for ordinary spawns, first candidate only for worktree spawns), and verify with unit tests for deterministic resolution, worktree single-candidate behavior, unknown category, unconfigured category, and no-authenticated-candidate errors
- [ ] 4.2 Update the `model` parameter description and routing guidelines in `index.ts` to document `task:<category>`, and verify existing exact-reference, fallback-list, frontmatter, and inheritance tests still pass unchanged

## 5. /subagents-init command

- [ ] 5.1 Implement the native config write seam: read-modify-write of the user config replacing only `models.tasks` and metadata, creating directory/file when absent, preserving all other keys, never touching the package directory, and verify with unit tests covering fresh file, existing unrelated keys, and invalid existing JSON
- [ ] 5.2 Register the `/subagents-init` command whose prompt directs the agent to dump the authenticated registry, research current task-fit when web search is available (registry-only heuristics otherwise, labeled), write through the seam, and present the category table with generation metadata, and verify by running the command end-to-end in a Pi session and inspecting the written config and summary

## 6. Documentation and vocabulary

- [ ] 6.1 Update `README.md` (configuration, tool parameters, `/subagents-init`), `CONTEXT.md` (task-category vocabulary and the loop-templates future direction), and `pi-extension/subagents/plan-skill.md` (use `task:` categories or configured shortlists instead of raw tier prose), and verify docs mention every supported category consistently
- [ ] 6.2 Sync bundled role prompts in `agents/` that reference model selection (at minimum `adversarial-reviewer.md`) with the curated-shortlist contract, and verify `npm run format:check` and `test/package-skill.test.js` pass

## 7. Final verification

- [ ] 7.1 Run `npm test`, `npm run format:check`, `npm run lint`, `npm pack --dry-run`, and `git diff --check`, plus LSP diagnostics on every changed TypeScript file, and verify all pass
- [ ] 7.2 Confirm the change requires a major version bump in the release notes draft (no version change committed in this work) and verify no generated artifacts, sessions, or local config are staged
