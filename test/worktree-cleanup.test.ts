import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
	mkdirSync,
	symlinkSync,
	chmodSync,
} from "node:fs";
import childProcess, { spawn, execFileSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	readWorktreeManifest,
	writeWorktreeManifest,
} from "../pi-extension/subagents/launch.ts";
import { __herdrTest__ } from "../pi-extension/subagents/herdr.ts";
import {
	cleanupBlockers,
	createWorktreeCleanupOperations,
	__worktreeCleanupTest__,
	listContainedWorktrees,
	removeContainedWorktree,
	worktreeInventoryNotice,
	formatWorktreeInventory,
	type CleanupGitState,
	type WorktreeCleanupOperations,
} from "../pi-extension/subagents/worktree-cleanup.ts";

export function cleanupFixture() {
	const calls: string[] = [];
	const state: CleanupGitState = {
		branch: "task",
		headSha: "local-only-commit",
		registered: true,
		locked: false,
		dirtyFiles: 0,
		untrackedFiles: 0,
		ignoredFiles: 0,
		conflicts: 0,
		submodules: false,
	};
	let present = true;
	const operations: WorktreeCleanupOperations = {
		scan: () => (present ? ["/managed/repo/task"] : []),
		managedRoot: () => "/managed",
		realpath: (path) => path,
		resolveSource: () => "/repo",
		inspectGit: () => ({ ...state }),
		listHerdr: () => [],
		readManifests: () => [],
		holders: async () => [],
		exists: () => present,
		preserve: () => {
			calls.push("preserve");
			state.dirtyFiles = 0;
			state.untrackedFiles = 0;
			state.headSha = "wip-sha";
			return "wip-sha";
		},
		removeWorkspace: (id) => {
			calls.push(`herdr:${id}`);
			present = false;
		},
		removeCheckout: (source, path) => {
			calls.push(`git:${source}:${path}`);
			present = false;
		},
		prune: (source) => {
			assert.equal(present, false);
			calls.push(`prune:${source}`);
		},
		writeManifest: (_file, value) => {
			calls.push(`manifest:${value.state}`);
			assert.equal(Number.isFinite(value.workspaceRemovedAt), true);
		},
	};
	return {
		operations,
		calls,
		state,
		input: { cwd: "/repo", operations, target: "task" },
	};
}

describe("cleanup operating-system probes", () => {
	it("bounds Git and Herdr cleanup exec calls and fails closed on timeout", async (t) => {
		const ops = createWorktreeCleanupOperations({
			manifestDir: "/unused",
			liveHolders: () => [],
		});
		const calls: string[] = [];
		const mocked = t.mock.method(
			childProcess,
			"execFileSync",
			(
				file: string,
				_args: string[],
				options: { timeout?: number; killSignal?: string },
			) => {
				assert.equal(options.timeout, 30_000);
				assert.equal(options.killSignal, "SIGKILL");
				calls.push(file);
				throw new Error("ETIMEDOUT");
			},
		);
		syncBuiltinESMExports();
		try {
			const f = cleanupFixture();
			f.operations.inspectGit = ops.inspectGit;
			const result = await removeContainedWorktree(f.input);
			assert.equal(result.status, "blocked");
			assert.match(result.message, /ETIMEDOUT/);
			assert.deepEqual(f.calls, []);
			assert.throws(() => ops.listHerdr("/repo"), /ETIMEDOUT/);
			assert.throws(() => ops.removeWorkspace("fixture"), /ETIMEDOUT/);
			assert.deepEqual(calls, ["git", "herdr", "herdr"]);
		} finally {
			mocked.mock.restore();
			syncBuiltinESMExports();
		}
	});
	it("detects a real node-MainThread process through /proc, not a runtime allowlist", {
		skip: process.platform !== "linux",
	}, async () => {
		const dir = mkdtempSync(join(tmpdir(), "cleanup-proc-"));
		const checkout = join(dir, "checkout");
		const procRoot = join(dir, "proc");
		mkdirSync(checkout);
		mkdirSync(procRoot);
		const child = spawn(
			process.execPath,
			[
				"-e",
				'process.title="node-MainThread"; console.log("ready"); setInterval(() => {}, 1000)',
			],
			{ cwd: checkout, stdio: ["ignore", "pipe", "pipe"] },
		);
		try {
			await once(child.stdout!, "data");
			symlinkSync(`/proc/${child.pid}`, join(procRoot, String(child.pid)));
			assert.equal(
				readFileSync(`/proc/${child.pid}/comm`, "utf8").trim(),
				"node-MainThread",
			);
			for (const idleShellPids of [new Set<number>(), new Set([child.pid!])]) {
				assert.match(
					__worktreeCleanupTest__
						.processHolders(checkout, idleShellPids, procRoot)
						.join(),
					/node-MainThread.*holds the checkout/,
				);
			}
		} finally {
			child.kill();
			await once(child, "exit");
			rmSync(dir, { recursive: true });
		}
	});
	it("blocks non-runtime holders and unverifiable live process cwd", {
		skip: process.platform !== "linux",
	}, () => {
		const dir = mkdtempSync(join(tmpdir(), "cleanup-proc-"));
		try {
			mkdirSync(join(dir, "123"));
			writeFileSync(join(dir, "123", "comm"), "python3\n");
			writeFileSync(join(dir, "123", "status"), "State:\tS (sleeping)\n");
			symlinkSync(dir, join(dir, "123", "cwd"));
			assert.match(
				__worktreeCleanupTest__.processHolders(dir, new Set(), dir).join(),
				/python3.*holds/,
			);
			rmSync(join(dir, "123", "cwd"));
			assert.throws(
				() => __worktreeCleanupTest__.processHolders(dir, new Set(), dir),
				/inspection unavailable/,
			);
		} finally {
			rmSync(dir, { recursive: true });
		}
	});
	it("tolerates symlinked ancestors but blocks a checkout symlink escaping the managed root", async () => {
		const dir = mkdtempSync(join(tmpdir(), "cleanup-alias-"));
		try {
			const root = join(dir, "real", "managed");
			const path = join(root, "repo", "task");
			mkdirSync(path, { recursive: true });
			symlinkSync(join(dir, "real"), join(dir, "home"));
			const ops = createWorktreeCleanupOperations({
				managedRoot: join(dir, "home", "managed"),
				manifestDir: join(dir, "manifests"),
				liveHolders: () => [],
			});
			ops.resolveSource = () => join(dir, "home");
			ops.inspectGit = () => ({ ...cleanupFixture().state });
			ops.listHerdr = () => [];
			ops.holders = async () => [];
			const [row] = await listContainedWorktrees({
				cwd: join(dir, "home"),
				operations: ops,
			});
			assert.equal(row.classification, "eligible");
			assert.equal(row.path, path);
			assert.equal(row.sourceRepo, join(dir, "real"));
			symlinkSync(dir, join(root, "repo", "escape"));
			const escaped = (
				await listContainedWorktrees({ cwd: dir, operations: ops })
			).find((entry) => entry.path.endsWith("escape"))!;
			assert.equal(escaped.classification, "unknown");
			assert.match(escaped.blockers.join(), /symlink to an unmanaged/);
		} finally {
			rmSync(dir, { recursive: true });
		}
	});
	it("probes ignored files and detached HEAD, and restores the exact index after a failed hook", async () => {
		const dir = mkdtempSync(join(tmpdir(), "cleanup-git-"));
		const git = (args: string[]) =>
			execFileSync("git", args, {
				cwd: dir,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			});
		try {
			git(["init", "-q", "-b", "task"]);
			git(["config", "user.name", "Cleanup test"]);
			git(["config", "user.email", "cleanup@example.invalid"]);
			git(["config", "commit.gpgsign", "false"]);
			writeFileSync(join(dir, ".gitignore"), ".env\n");
			writeFileSync(join(dir, "tracked"), "base\n");
			git(["add", "."]);
			git(["commit", "-qm", "base"]);
			writeFileSync(join(dir, "tracked"), "staged\n");
			git(["add", "tracked"]);
			writeFileSync(join(dir, "tracked"), "unstaged\n");
			writeFileSync(join(dir, "new-file"), "untracked\n");
			writeFileSync(join(dir, ".env"), "ignored fixture\n");
			const ops = createWorktreeCleanupOperations({
				manifestDir: join(dir, "manifests"),
				liveHolders: () => [],
			});
			assert.equal(ops.inspectGit(dir, dir).ignoredFiles, 1);
			const index = readFileSync(join(dir, ".git", "index"));
			const status = git(["status", "--porcelain=v1"]);
			const hook = join(dir, ".git", "hooks", "pre-commit");
			writeFileSync(hook, "#!/bin/sh\nexit 1\n");
			chmodSync(hook, 0o755);
			const entry = (await listContainedWorktrees(cleanupFixture().input))[0];
			entry.path = dir;
			assert.throws(() => ops.preserve(entry));
			assert.deepEqual(readFileSync(join(dir, ".git", "index")), index);
			assert.equal(git(["status", "--porcelain=v1"]), status);
			assert.equal(readFileSync(join(dir, "tracked"), "utf8"), "unstaged\n");
			assert.equal(readFileSync(join(dir, "new-file"), "utf8"), "untracked\n");
			git([
				"update-ref",
				"--no-deref",
				"HEAD",
				git(["rev-parse", "HEAD"]).trim(),
			]);
			entry.git = ops.inspectGit(dir, dir);
			assert.equal(entry.git.branch, "");
			assert.match(cleanupBlockers(entry).join(), /Detached HEAD/);
			entry.branch = entry.git.branch;
			assert.throws(() => ops.preserve(entry), /Retained branch/);
		} finally {
			rmSync(dir, { recursive: true });
		}
	});
});

describe("explicit worktree cleanup", () => {
	it("lists contained cross-session orphans and retains local-only history", async () => {
		const f = cleanupFixture();
		const [row] = await listContainedWorktrees(f.input);
		assert.equal(row.classification, "eligible");
		assert.equal(row.sourceRepo, "/repo");
		assert.deepEqual(row.manifest, []);
		assert.match(formatWorktreeInventory([row]), /manifest: absent/);
		assert.deepEqual(f.calls, []);
	});
	for (const [name, patch, blocker] of [
		["dirty", { dirtyFiles: 1 }, /Dirty/],
		["untracked", { untrackedFiles: 1 }, /untracked/],
		["conflicted", { conflicts: 1 }, /conflicted/],
		["submodules", { submodules: true }, /deinitialize/],
		["locked", { locked: true }, /locked/],
		["detached", { branch: "" }, /Detached/],
		["residue", { registered: false }, /unknown residue/],
	] as const) {
		it(`blocks ${name} without any removal effects`, async () => {
			const f = cleanupFixture();
			Object.assign(f.state, patch);
			const result = await removeContainedWorktree({
				...f.input,
				target: "/managed/repo/task",
			});
			assert.equal(result.status, "blocked");
			assert.match(result.message, blocker);
			assert.deepEqual(f.calls, []);
		});
	}
	it("fails closed for out-of-scope and prefix-collision repositories", async () => {
		const f = cleanupFixture();
		f.operations.resolveSource = () => "/repo-other";
		assert.equal(
			(await listContainedWorktrees(f.input))[0].classification,
			"out-of-scope",
		);
		assert.equal(
			(await removeContainedWorktree({ ...f.input, preserve: true })).status,
			"blocked",
		);
		assert.deepEqual(f.calls, []);
	});
	it("canonicalizes cwd and source paths before containment", async () => {
		const f = cleanupFixture();
		f.operations.realpath = (path) => (path === "/alias" ? "/repo" : path);
		assert.equal(
			(await listContainedWorktrees({ ...f.input, cwd: "/alias" }))[0]
				.classification,
			"eligible",
		);
		assert.equal(
			(await listContainedWorktrees({ ...f.input, cwd: "/repo/subfolder" }))[0]
				.classification,
			"out-of-scope",
		);
	});
	for (const probe of [
		"inspectGit",
		"listHerdr",
		"holders",
		"resolveSource",
		"realpath",
	] as const) {
		it(`reports unknown when ${probe} fails`, async () => {
			const f = cleanupFixture();
			f.operations[probe] = () => {
				throw new Error("probe unavailable");
			};
			const [row] = await listContainedWorktrees(f.input);
			assert.equal(row.classification, "unknown");
			assert.match(row.blockers.join(), /probe unavailable/);
			assert.equal(
				(
					await removeContainedWorktree({
						...f.input,
						target: row.path,
						preserve: true,
					})
				).status,
				"blocked",
			);
			assert.deepEqual(f.calls, []);
		});
	}
	for (const holder of [
		"Live child holds the worktree",
		"Persistent-specialist lease holds the worktree",
	]) {
		it(`blocks ${holder}`, async () => {
			const f = cleanupFixture();
			f.operations.holders = async () => [holder];
			const result = await removeContainedWorktree({
				...f.input,
				preserve: true,
			});
			assert.equal(result.status, "blocked");
			assert.match(result.message, new RegExp(holder));
			assert.deepEqual(f.calls, []);
		});
	}
	it("blocks symlink aliases without turning the target into a managed candidate", async () => {
		const f = cleanupFixture();
		f.operations.realpath = (path) =>
			path === "/managed/repo/task" ? "/unmanaged/task" : path;
		const [row] = await listContainedWorktrees(f.input);
		assert.equal(row.path, "/managed/repo/task");
		assert.equal(row.classification, "unknown");
		assert.equal(
			(await removeContainedWorktree({ ...f.input, target: row.path })).status,
			"blocked",
		);
		assert.equal(
			(await removeContainedWorktree({ ...f.input, target: "/unmanaged/task" }))
				.status,
			"blocked",
		);
		assert.deepEqual(f.calls, []);
	});
	for (const source of ["Herdr", "manifest"]) {
		it(`blocks ${source} identity disagreements`, async () => {
			const f = cleanupFixture();
			if (source === "Herdr")
				f.operations.listHerdr = () => [
					{
						path: "/managed/repo/task",
						branch: "other",
						isLinkedWorktree: true,
					},
				];
			else
				f.operations.readManifests = () => [
					{
						file: "/manifest",
						value: { path: "/managed/repo/task", branch: "other" },
					},
				];
			const result = await removeContainedWorktree(f.input);
			assert.equal(result.status, "blocked");
			assert.match(result.message, /identity disagree/);
			assert.deepEqual(f.calls, []);
		});
	}
	it("preserve never bypasses conflicts or submodule blockers", async () => {
		for (const patch of [
			{ conflicts: 1 },
			{ submodules: true },
			{ branch: "" },
		]) {
			const f = cleanupFixture();
			Object.assign(f.state, { dirtyFiles: 1 }, patch);
			assert.equal(
				(await removeContainedWorktree({ ...f.input, preserve: true })).status,
				"blocked",
			);
			assert.deepEqual(f.calls, []);
		}
	});
	it("uses Herdr for an open workspace and merges the reachable manifest", async () => {
		const f = cleanupFixture();
		f.operations.listHerdr = () => [
			{
				path: "/managed/repo/task",
				branch: "task",
				isLinkedWorktree: true,
				workspaceId: "w1",
			},
		];
		f.operations.readManifests = () => [
			{
				file: "/manifest.json",
				value: {
					branch: "task",
					path: "/managed/repo/task",
					state: "ready_for_review",
					baseSha: "base",
				},
			},
		];
		const result = await removeContainedWorktree(f.input);
		assert.equal(result.status, "removed");
		assert.equal(result.entry?.manifest[0].value.baseSha, "base");
		assert.deepEqual(f.calls, ["herdr:w1", "manifest:removed"]);
		assert.match(result.message, /Branch task and its commits retained/);
	});
	it("uses Git for an orphan, then prunes only after absence is verified", async () => {
		const f = cleanupFixture();
		assert.equal((await removeContainedWorktree(f.input)).status, "removed");
		assert.deepEqual(f.calls, ["git:/repo:/managed/repo/task", "prune:/repo"]);
		assert.equal("deleteBranch" in f.operations, false);
	});
	it("reprobes eligibility immediately before removal", async () => {
		const f = cleanupFixture();
		let count = 0;
		f.operations.holders = async () =>
			++count === 1 ? [] : ["Live child restarted"];
		assert.equal((await removeContainedWorktree(f.input)).status, "blocked");
		assert.deepEqual(f.calls, []);
	});
	for (const kind of ["herdr", "git", "checkout-present", "prune"] as const) {
		it(`reports ${kind} failure without marking manifests removed`, async () => {
			const f = cleanupFixture();
			const fail = () => {
				throw new Error("refused");
			};
			if (kind === "herdr") {
				f.operations.listHerdr = () => [
					{
						path: "/managed/repo/task",
						branch: "task",
						isLinkedWorktree: true,
						workspaceId: "w1",
					},
				];
				f.operations.removeWorkspace = fail;
			}
			if (kind === "git") f.operations.removeCheckout = fail;
			if (kind === "checkout-present") f.operations.removeCheckout = () => {};
			if (kind === "prune") f.operations.prune = fail;
			f.operations.readManifests = () => [
				{
					file: "/manifest.json",
					value: { path: "/managed/repo/task", branch: "task" },
				},
			];
			assert.equal((await removeContainedWorktree(f.input)).status, "failed");
			assert.equal(
				f.calls.some((call) => call.startsWith("manifest:")),
				false,
			);
			if (kind !== "prune")
				assert.equal(
					f.calls.some((call) => call.startsWith("prune:")),
					false,
				);
		});
	}
	it("requires explicit preservation and reports its SHA", async () => {
		const f = cleanupFixture();
		f.state.dirtyFiles = 2;
		f.state.untrackedFiles = 1;
		assert.equal((await removeContainedWorktree(f.input)).status, "blocked");
		const result = await removeContainedWorktree({
			...f.input,
			preserve: true,
		});
		assert.equal(result.status, "removed");
		assert.equal(result.preservationSha, "wip-sha");
		assert.deepEqual(f.calls, [
			"preserve",
			"git:/repo:/managed/repo/task",
			"prune:/repo",
		]);
	});
	it("preservation failure aborts removal with state retained", async () => {
		const f = cleanupFixture();
		f.state.dirtyFiles = 1;
		f.operations.preserve = () => {
			throw new Error("commit hook rejected");
		};
		const result = await removeContainedWorktree({
			...f.input,
			preserve: true,
		});
		assert.equal(result.status, "failed");
		assert.match(result.message, /commit hook rejected/);
		assert.equal(f.state.dirtyFiles, 1);
		assert.deepEqual(f.calls, []);
	});
	it("rechecks dirty state after preservation", async () => {
		const f = cleanupFixture();
		f.state.dirtyFiles = 1;
		f.operations.preserve = () => "sha-but-still-dirty";
		assert.equal(
			(await removeContainedWorktree({ ...f.input, preserve: true })).status,
			"blocked",
		);
		assert.deepEqual(f.calls, []);
	});
	it("refuses ambiguous names and unknown targets", async () => {
		const f = cleanupFixture();
		assert.equal(
			(await removeContainedWorktree({ ...f.input, target: "absent" })).status,
			"blocked",
		);
		f.operations.scan = () => ["/managed/repo/task", "/managed/other/task"];
		assert.match((await removeContainedWorktree(f.input)).message, /Ambiguous/);
		assert.deepEqual(f.calls, []);
	});
	it("ignores removed manifests when the branch is relaunched at the same path", async () => {
		const f = cleanupFixture();
		f.operations.readManifests = () => [
			{
				file: "/old.json",
				value: {
					path: "/managed/repo/task",
					branch: "previous",
					workspaceId: "old",
					state: "removed",
				},
			},
		];
		assert.equal(
			(await listContainedWorktrees(f.input))[0].classification,
			"eligible",
		);
		assert.equal((await removeContainedWorktree(f.input)).status, "removed");
		assert.deepEqual(f.calls, ["git:/repo:/managed/repo/task", "prune:/repo"]);
	});
	it("discloses ignored files in inventory and removal without blocking", async () => {
		const f = cleanupFixture();
		f.state.ignoredFiles = 2;
		const rows = await listContainedWorktrees(f.input);
		assert.equal(rows[0].classification, "eligible");
		assert.match(formatWorktreeInventory(rows), /2 ignored/);
		assert.match(
			(await removeContainedWorktree(f.input)).message,
			/Deleted 2 ignored files/,
		);
	});
	it("reports ignored exclusions and preservation SHA after later refusal or failure", async () => {
		for (const kind of ["preserve", "reinspect", "remove"]) {
			const f = cleanupFixture();
			f.state.dirtyFiles = 1;
			f.state.ignoredFiles = 2;
			if (kind === "preserve")
				f.operations.preserve = () => {
					throw new Error("hook rejected");
				};
			if (kind === "reinspect") {
				const preserve = f.operations.preserve;
				f.operations.preserve = (entry) => {
					const sha = preserve(entry);
					f.state.locked = true;
					return sha;
				};
			}
			if (kind === "remove")
				f.operations.removeCheckout = () => {
					throw new Error("remove refused");
				};
			const result = await removeContainedWorktree({
				...f.input,
				preserve: true,
			});
			assert.notEqual(result.status, "removed");
			assert.match(
				result.message,
				/2 ignored files are not captured by preservation/,
			);
			if (kind !== "preserve") assert.match(result.message, /wip-sha/);
		}
	});
	it("reports manifest write failure as removed with warning", async () => {
		const f = cleanupFixture();
		f.operations.readManifests = () => [
			{
				file: "/manifest",
				value: { path: "/managed/repo/task", branch: "task" },
			},
		];
		f.operations.writeManifest = () => {
			throw new Error("permission denied");
		};
		const result = await removeContainedWorktree(f.input);
		assert.equal(result.status, "removed");
		assert.match(result.message, /Warning: Manifest.*permission denied/);
	});
	it("reports inspection failure instead of claiming an existing branch is missing", async () => {
		const f = cleanupFixture();
		f.operations.inspectGit = () => {
			throw new Error("Git timed out");
		};
		const result = await removeContainedWorktree(f.input);
		assert.equal(result.status, "blocked");
		assert.match(result.message, /Git timed out/);
		assert.doesNotMatch(result.message, /Target not found/);
	});
	it("already removed is a no-op with retained manifest evidence", async () => {
		const f = cleanupFixture();
		f.operations.scan = () => [];
		f.operations.exists = () => false;
		f.operations.readManifests = () => [
			{
				file: "/manifest",
				value: { path: "/managed/repo/task", branch: "task", state: "removed" },
			},
		];
		assert.equal(
			(await removeContainedWorktree(f.input)).status,
			"already-removed",
		);
		assert.deepEqual(f.calls, []);
	});
	it("counts contained worktrees only, without mutation, and stays silent at zero", async () => {
		const f = cleanupFixture();
		const rows = await listContainedWorktrees(f.input);
		assert.match(
			worktreeInventoryNotice(rows)!,
			/1 present · 1 eligible · 0 blocked/,
		);
		assert.equal(worktreeInventoryNotice([]), undefined);
		assert.deepEqual(f.calls, []);
		assert.deepEqual(cleanupBlockers(rows[0]), []);
	});
	it("removal args contain only the explicit workspace selector", () => {
		assert.deepEqual(__herdrTest__.buildWorktreeRemoveArgs("w1"), [
			"worktree",
			"remove",
			"--workspace",
			"w1",
		]);
	});
	it("manifest read/merge-write round-trip retains metadata and skips invalid JSON", () => {
		const dir = mkdtempSync(join(tmpdir(), "cleanup-manifest-"));
		const file = join(dir, "manifest.json");
		try {
			writeWorktreeManifest(file, {
				branch: "task",
				state: "running",
				baseSha: "base",
			});
			writeWorktreeManifest(file, {
				state: "removed",
				workspaceRemovedAt: 123,
			});
			assert.equal(readWorktreeManifest(file)?.state, "removed");
			assert.equal(readWorktreeManifest(file)?.baseSha, "base");
			assert.equal(
				JSON.parse(readFileSync(file, "utf8")).workspaceRemovedAt,
				123,
			);
			writeFileSync(file, "{");
			assert.equal(readWorktreeManifest(file), undefined);
			writeFileSync(file, JSON.stringify({ owner: "foreign" }));
			assert.equal(readWorktreeManifest(file), undefined);
		} finally {
			rmSync(dir, { recursive: true });
		}
	});
});
