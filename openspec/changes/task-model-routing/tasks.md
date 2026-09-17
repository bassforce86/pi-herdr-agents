## 1. Global config relocation (BREAKING)

- [x] 1.1 Add a shared config-path module resolving `$PI_CODING_AGENT_DIR/herdr-agents/config.json` (default `~/.pi/agent/herdr-agents/config.json`) with the packaged `config.json.example` as per-section fallback, and verify with unit tests covering existing file, missing file, `PI_CODING_AGENT_DIR` override, and error-path naming the resolved path
- [x] 1.2 Route all six readers — `model-config.ts`, `role-config.ts`, `pane-config.ts`, `supervision-config.ts`, `persistent-config.ts`, and `status.ts` — through the shared module, delete per-reader `PACKAGE_ROOT` config paths, keep models' missing-file-as-unconfigured semantics, and verify `npm test` passes with a test asserting package-root `config.json` is ignored by every reader including status
- [x] 1.3 Update `README.md` (including the package-local config mentions), `AGENTS.md`, `RELEASING.md`, and the package-local config references in `docs/adr/0002-agent-workflow-skill-runtime-taxonomy.md` and `docs/adr/0003-installable-role-packs.md` for the new location and the manual-move/re-init migration note, and verify `npm run format:check` passes
- [x] 1.4 Exclude `openspec/` from the npm tarball and verify `npm pack --dry-run` lists no `openspec/` paths while still including `CHANGELOG.md` and the orchestrate skill files

## 2. models.tasks config schema

- [x] 2.1 Extend the models config parser with strict `models.tasks` (categories `coding`, `review`, `recon`, `qa`, `architecture`, `docs`; ordered non-empty lists of non-empty strings; empty object treated as absent) and `models.tasksMeta` (`generatedAt` ISO-8601 string, `method` `"research"`/`"registry-only"`), allowlisting both under `models`, rejecting unknown category keys with an error listing supported categories, and verify with parser unit tests for valid, unknown-key, empty-list, non-string, empty-object, and invalid-metadata cases
- [x] 2.2 Keep `config.json.example` valid JSON with no comments and no `models.tasks`, add the annotated `models.tasks`/`models.tasksMeta` sample to `README.md` instead, and verify with a test that the packaged example parses with `JSON.parse` and `npm pack --dry-run` still includes it

## 3. Guidance rendering

- [x] 3.1 Render configured task categories (authenticated candidates only, configured order) into `buildSubagentRoutingGuidelines`/catalog output, preserving generic tier text when `models.tasks` is absent or empty, and including the review instruction to skip the authoring family and use an exact ID for reviews when an author is known, and verify with unit tests asserting rendered guidance for configured, partially-authenticated, empty, and unconfigured cases

## 4. task:<category> resolution

- [x] 4.1 Expand whole-value `task:<category>` (trimmed, case-insensitive) in the `subagent` tool's `model` parameter into the category's authenticated candidates before fallback parsing and before the worktree fallback guard (full chain for ordinary spawns, first candidate for worktree spawns), and verify with unit tests for deterministic resolution, worktree single-candidate behavior without guard errors, mixed comma-list rejection, empty/unknown/unconfigured category errors listing configured categories, and no-authenticated-candidate errors listing alternatives
- [x] 4.2 Reject `task:` references in agent frontmatter `model`, `models.agents.*`, and `models.default` with clear errors, and verify with unit tests for each source
- [x] 4.3 Update the `model` parameter description and routing guidelines in `index.ts` to document whole-value `task:<category>`, and verify existing exact-reference, fallback-list, frontmatter, and inheritance tests still pass unchanged

## 5. /subagents-init command

- [x] 5.1 Implement the native write seam: resolve the user config path, seed a missing file from packaged `config.json.example`, re-read before modify, replace only `models.tasks` and `models.tasksMeta`, validate schema plus exact-reference and authenticated-candidate checks, write atomically via temp file + rename, never touch the package directory, and verify with unit tests covering fresh-file seeding (all six sections still load, including status), existing unrelated keys preserved deep-equal, invalid candidates rejected without file change, and atomicity of the write path
- [ ] 5.2 Register the `/subagents-init` command whose prompt directs the agent to dump the authenticated registry (registry object, not the catalog string), research current task-fit when web search is available (registry-only ranking otherwise, recorded in `tasksMeta.method`), submit the draft through the seam, and present the category table, generation metadata, and the `/reload` instruction, and verify by running the command end-to-end in a Pi session and inspecting the written config, section loadability, and summary

## 6. Documentation and vocabulary

- [x] 6.1 Update `README.md` (configuration, tool parameters, `/subagents-init`), `CONTEXT.md` (task-category vocabulary, category-to-role mapping, and the loop-templates future direction), and `pi-extension/subagents/plan-skill.md` (recommend `task:` categories or configured shortlists for non-review roles while keeping the exact-ID family-diversity rule for reviewers), and verify docs mention every supported category consistently
- [x] 6.2 Sync bundled role prompts in `agents/` and `skills/orchestrate/SKILL.md` guidance that reference model selection (at minimum `adversarial-reviewer.md`) with the curated-shortlist contract and the review exact-ID rule, and verify `npm run format:check` and `test/package-skill.test.js` pass

## 7. Final verification

- [x] 7.1 Run `npm test`, `npm run format:check`, `npm run lint`, `npm pack --dry-run`, and `git diff --check`, plus LSP diagnostics on every changed TypeScript file, and verify all pass
- [x] 7.2 Confirm the change requires a major version bump in the release notes draft (no version change committed in this work) and verify no generated artifacts, sessions, or local config are staged
