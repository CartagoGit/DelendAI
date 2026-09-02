/**
 * commit-driver.ts — the pure commit engine.
 *
 * Resolves identity → applies audit trailer → calls
 * `commitWithGuard`. Holds NO
 * knowledge of MCP, tools, or triggers — `commit-tool.ts` and
 * `triggers/*` both consume this surface.
 *
 * Returns an `ICommitDriverResult` that mirrors `ICommitAndPushResult`
 * (committed/pushed/hash) plus a typed `refusal` field that
 * captures the structured refusal reasons the policy layer can
 * generate (commit disabled, identity empty, protected branch, …).
 */

// effect-boundary-authorized: isolated Git adapter needs child_process and temporary index files
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	withFileMutex,
	gitAdd,
	gitCommit,
	gitHeadShortHash,
	stripAnsi,
	type ICommitAndPushResult,
	type IGitRunner,
	type IGitRunResult,
} from '@mcp-vertex/core/public';

import { appendAuditTrailer, type IAuditAgent } from '../audit/trailer';
import {
	branchProtectedRefusal,
	classifyRefusal,
	isBranchProtected,
} from '../contracts/branch';
import type { ICommitPolicyOptions } from '../contracts/options';
import { resolveProtectedBranches } from '../contracts/constants/protected-branches';
import type { IIdentityResolverContext } from '../identity/resolver';
import { resolveAuthor } from '../identity/resolver';
import {
	gitCachedNames,
	gitCurrentBranch,
	gitDirtyFilePaths,
	validateConventionalHeader,
} from './git-extra';
import {
	buildForeignLockRefusal,
	filterForeignLockedFiles,
} from './foreign-lock-filter';

import type { IForeignLockProvider } from '../contracts/interfaces/foreign-lock.interface';

/**
 * Non-slice trigger context. Threshold and interval events carry
 * `files` so the driver stages exactly the paths the trigger saw —
 * x00264 (AUD-CP-006) closes the "predicate ≠ action" gap that
 * previously allowed an implicit `skipAdd: true`.
 */
export interface ITriggerContext {
	readonly kind: 'threshold' | 'interval';
	readonly files: readonly string[];
}

/** Inputs the driver consumes. Pure data — no MCP. */
export interface ICommitDriverInput {
	/** Original commit message (Conventional Commit prefix expected). */
	readonly message: string;
	/** Explicit file list to stage. When empty, the driver uses `skipAdd: true`. */
	readonly files?: readonly string[];
	/**
	 * Optional slice context — when present, the driver enforces
	 * `commit.autoScopeFromProposal`, refuses protected branches,
	 * and stamps the conventional-commit scope with `<id>(<scope>)`.
	 */
	readonly sliceContext?:
		| {
				readonly proposalId: string;
				readonly sliceId: string;
				readonly files: readonly string[];
		  }
		| undefined;
	/**
	 * x00264: optional non-slice trigger context. Carries the
	 * exact paths the trigger saw so the driver stages that
	 * same set. Refused as `TRIGGER_HAS_NO_FILES` when the list
	 * is empty (the trigger fired with zero dirty paths).
	 */
	readonly triggerContext?: ITriggerContext | undefined;
	/**
	 * f00417: machine-resolved scope for slice events. When set,
	 * the post-stage subset check failure upgrades
	 * CROSS_AGENT_CONTAMINATION to CAUSALITY_VIOLATION. The
	 * engine supplies this whenever the slice event's resolver
	 * produced a non-empty scope; absence means the trigger was
	 * a manual/threshold/interval sweep.
	 */
	readonly resolvedSliceScope?:
		| {
				readonly proposalId: string;
				readonly sliceId: string;
				readonly files: readonly string[];
		  }
		| undefined;
}

export interface ICommitDriverResult extends ICommitAndPushResult {
	/** Optional policy refusal — when set, `committed` is false. */
	readonly refusal?: string;
	/** Stable machine-readable refusal category, when refused. */
	readonly code?: import('../contracts/branch').CommitPolicyRefusalCode;
	/** Whether `git commit` created a new commit object. */
	readonly commitCreated?: boolean;
	/** Whether the operation moved HEAD. */
	readonly headMoved?: boolean;
	/** Full HEAD before the guarded commit path ran. */
	readonly headBefore?: string | undefined;
	/** Full HEAD after the guarded commit path finished. */
	readonly headAfter?: string | undefined;
	/** Pre-commit trace for stage → validate → commit assertions. */
	readonly trace?: ICommitTrace | undefined;
	/**
	 * Files left out because another agent holds them. A partial
	 * withholding still commits — the rest of the work is finished and
	 * has every right to land — but it must never be silent: the caller
	 * has to be able to tell "I committed all of it" from "I committed
	 * what was mine".
	 */
	readonly withheldForeignLocks?: readonly string[] | undefined;
	/** The resolved author at commit time (for audit / output). */
	readonly resolvedAuthor?:
		| {
				readonly displayName: string;
				readonly email: string;
				readonly label: string;
		  }
		| undefined;
	/**
	 * f00417: when a slice event drove this commit and the
	 * post-stage subset check fails, the driver returns
	 * CAUSALITY_VIOLATION instead of the older
	 * CROSS_AGENT_CONTAMINATION. The engine surfaces the
	 * machine-readable refusal code via `IEngineResult.code`.
	 */
	readonly resolvedSliceScope?:
		| {
				readonly proposalId: string;
				readonly sliceId: string;
				readonly files: readonly string[];
		  }
		| undefined;
}

/**
 * Driver options — what's needed to make a commit. Built once at
 * register time and reused for every commit. The git runner is
 * injected so tests can drive it without spawning a real git.
 */
export interface ICommitDriverOptions {
	readonly run: IGitRunner;
	readonly policy: ICommitPolicyOptions;
	readonly identityCtx: IIdentityResolverContext;
	readonly workspaceRoot?: string | undefined;
	readonly pluginCacheDir?: string | undefined;
	/** Identity snapshot (host + model) used by the audit trailer. */
	readonly auditAgent: IAuditAgent | null;
	/**
	 * Optional: asks another component which of these files a DIFFERENT
	 * agent currently holds. Injected rather than imported, so
	 * commit-policy stays independent of proposals — a host without it
	 * passes nothing and the driver behaves exactly as before.
	 *
	 * This is the one safeguard that survives any policy: with
	 * `sliceScoping: false` and `allowForeignChanges: true` the operator
	 * has asked for the whole dirty worktree, and no care inside that
	 * policy can avoid catching a file another agent is midway through
	 * writing. A held file is not "foreign changes the operator opted
	 * into" — it is an unfinished edit, and committing it is how a shared
	 * branch goes red with nobody having broken it.
	 */
	readonly foreignLocks?: IForeignLockProvider | undefined;
	/** This committer's agent id, so its own claims are not withheld. */
	readonly selfAgent?: string | undefined;
}

export interface ICommitTrace {
	readonly commitCreated: boolean;
	readonly headBefore: string;
	readonly headAfter: string;
	readonly stagedSetAtPreCommit: readonly string[];
}

interface ICommitWithGuardArgs {
	readonly run: IGitRunner;
	readonly message: string;
	readonly authorFlag: string;
	readonly allowList: readonly string[];
	readonly enforceSubset: boolean;
	readonly branch?: string;
	readonly workspaceRoot?: string;
	readonly gitTimeoutMs?: number;
	/** f00417: when slice-context, the resolved scope the subset
	 * check is enforcing. Absence means CROSS_AGENT_CONTAMINATION
	 * on extras; presence upgrades to CAUSALITY_VIOLATION. */
	readonly resolvedSliceScope?:
		| {
				readonly proposalId: string;
				readonly sliceId: string;
				readonly files: readonly string[];
		  }
		| undefined;
}

type ICommitWithGuardResult =
	| {
			readonly committed: true;
			readonly pushed: false;
			readonly commitCreated: true;
			readonly headMoved: boolean;
			readonly headBefore: string;
			readonly headAfter: string;
			readonly hash?: string;
			readonly trace: ICommitTrace;
	  }
	| {
			readonly committed: false;
			readonly pushed: false;
			readonly commitCreated: false;
			readonly headMoved: false;
			readonly headBefore: string | undefined;
			readonly headAfter: string | undefined;
			readonly refusal: string;
			readonly code?: import('../contracts/branch').CommitPolicyRefusalCode;
			readonly trace?: ICommitTrace | undefined;
	  };

/**
 * Pure parse of a Conventional-Commit header line — see AUD-CP-001
 * (x00259). Returns a structured view that `buildScopedMessage`
 * can re-emit losslessly, including the original `type`, the
 * optional `scope`, the `!` breaking marker, and the remainder
 * (subject + body + footers).
 */
export interface IParsedHeader {
	readonly type: string;
	readonly scope: string | undefined;
	readonly breaking: boolean;
	/** Subject line minus the `type(scope)?!: ` prefix. */
	readonly subject: string;
	/** Body + footers (everything after the first `\n`). */
	readonly rest: string;
}

const HEADER_TYPE_PATTERN = '[A-Za-z][A-Za-z0-9_.-]*';
const SCOPE_PATTERN = String.raw`\([^)]+\)`;

export const parseHeader = (raw: string): IParsedHeader => {
	const trimmed = raw.trimStart();
	// Match: type(scope)!: subject OR type!: subject OR type: subject
	const re = new RegExp(
		`^(${HEADER_TYPE_PATTERN})(?:(${SCOPE_PATTERN}))?(!)?:\\s*([\\s\\S]*)$`,
	);
	const m = re.exec(trimmed);
	if (m === null) {
		// Not a Conventional-Commit header — return type='' so the
		// caller fails-closed instead of silently mangling the input.
		return {
			type: '',
			scope: undefined,
			breaking: false,
			subject: trimmed,
			rest: '',
		};
	}
	const [, type, scope, bang, rest = ''] = m as unknown as [
		string,
		string,
		string | undefined,
		string | undefined,
		string | undefined,
	];
	// Split the remainder into subject (first line) and rest (body+footers).
	const newlineIdx = rest.indexOf('\n');
	const subject =
		newlineIdx === -1 ? rest : rest.slice(0, newlineIdx).trimEnd();
	const restAfterSubject =
		newlineIdx === -1 ? '' : rest.slice(newlineIdx + 1);
	return {
		type,
		scope: scope !== undefined ? scope.slice(1, -1) : undefined,
		breaking: bang === '!',
		subject,
		rest: restAfterSubject,
	};
};

export const buildScopedMessage = (
	original: string,
	proposalId: string,
	autoScope: boolean,
): string => {
	if (!autoScope) return original;
	// Empty input — caller surfaces a typed refusal upstream; we
	// don't synthesize a header that would commit silently.
	if (original.trim().length === 0) return original;
	const parsed = parseHeader(original);
	const type = parsed.type === '' ? 'feat' : parsed.type;
	const scope = parsed.scope ?? proposalId;
	const bang = parsed.breaking ? '!' : '';
	// subject is the trimmed remainder when the input was bare text
	// (no header was matched); otherwise it is the original subject.
	const subject = parsed.type === '' ? original.trim() : parsed.subject;
	const head =
		parsed.rest.length > 0
			? `${type}(${scope})${bang}: ${subject}\n${parsed.rest}`
			: `${type}(${scope})${bang}: ${subject}`;
	return head;
};

/**
 * Pure commit attempt. The driver never throws — every failure
 * surfaces as a structured `refusal` or as the `reason` field of
 * the underlying `commitAndPush` result.
 */
/**
 * x00263 (AUD-CP-005): normalise a path to its repo-relative
 * POSIX form so the post-stage `git diff --cached --name-only`
 * subset check compares apples to apples regardless of whether
 * the caller passed a workspace-relative or absolute path.
 * Strips a leading `./` and converts `\\` to `/`.
 */
const normalizeRepoPath = (raw: string): string => {
	const replaced = raw.replace(/\\/gu, '/').trim();
	const arrow = replaced.lastIndexOf(' -> ');
	const path = arrow >= 0 ? replaced.slice(arrow + 4).trim() : replaced;
	return path.startsWith('./') ? path.slice(2) : path;
};

const normalizeStagePath = (raw: string): string => {
	const replaced = raw.replace(/\\/gu, '/').trim();
	const arrow = replaced.lastIndexOf(' -> ');
	return arrow >= 0 ? replaced.slice(arrow + 4).trim() : replaced;
};

const formatGitFailure = (
	operation: 'add' | 'commit',
	reason?: string,
): string => {
	const clean = stripAnsi(reason ?? 'unknown')
		.replace(/\s+/gu, ' ')
		.trim();
	return `git ${operation} failed: ${clean.length > 0 ? clean : 'unknown'}`;
};

const gitStdoutTrimmed = async (
	run: IGitRunner,
	args: readonly string[],
): Promise<string | undefined> => {
	const result = await run(args);
	if (!result.ok) return undefined;
	const trimmed = result.output.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const resetStagedPathsSafely = async (
	run: IGitRunner,
	paths: readonly string[],
): Promise<void> => {
	if (paths.length === 0) return;
	const resetResult = await run(['reset', 'HEAD', '--', ...paths]);
	if (resetResult.ok) return;
	await run(['rm', '--cached', '--ignore-unmatch', '--', ...paths]);
};

const resetWholeStageSafely = async (run: IGitRunner): Promise<void> => {
	const resetResult = await run(['reset', 'HEAD', '--']);
	if (resetResult.ok) return;
	const staged = await gitCachedNames(run);
	if (staged.length === 0) return;
	await run(['rm', '--cached', '--ignore-unmatch', '--', ...staged]);
};

const preserveRealIndexAfterIsolatedCommit = async (
	run: IGitRunner,
	stagedPaths: readonly string[],
): Promise<void> => {
	const resetResult = await run(['read-tree', 'HEAD']);
	if (!resetResult.ok || stagedPaths.length === 0) return;
	await gitAdd(run, stagedPaths);
};

const createGitRunnerWithEnv =
	(cwd: string, env: NodeJS.ProcessEnv, timeoutMs = 60_000): IGitRunner =>
	(args) =>
		new Promise<IGitRunResult>((resolve) => {
			execFile(
				'git',
				[...args],
				{
					cwd,
					encoding: 'utf8',
					env,
					timeout: timeoutMs,
					maxBuffer: 8 * 1024 * 1024,
				},
				(error, stdout, stderr) => {
					if (!error) {
						resolve({ ok: true, output: stdout });
						return;
					}
					const err = error as NodeJS.ErrnoException & {
						killed?: boolean;
						signal?: string;
					};
					let reason: string;
					if (err.code === 'ENOENT') {
						reason = 'git is not installed or not on PATH';
					} else if (err.killed || err.signal === 'SIGTERM') {
						reason = `git timed out after ${timeoutMs}ms`;
					} else {
						reason =
							stripAnsi(
								stderr || err.message || 'git command failed',
							)
								.trim()
								.split('\n')[0] ?? 'git command failed';
					}
					resolve({ ok: false, output: '', reason });
				},
			);
		});

const parseAuthorFlag = (
	authorFlag: string,
): { name: string; email: string } | undefined => {
	const match = /^(.*)\s<([^<>]+)>$/u.exec(authorFlag.trim());
	if (match === null) return undefined;
	const [, rawName, rawEmail] = match;
	const name = rawName?.trim() ?? '';
	const email = rawEmail?.trim() ?? '';
	if (name.length === 0 || email.length === 0) return undefined;
	return { name, email };
};

const buildIsolatedGitEnv = (
	indexPath: string,
	authorFlag: string,
): NodeJS.ProcessEnv => {
	const author = parseAuthorFlag(authorFlag);
	return {
		...process.env,
		GIT_INDEX_FILE: indexPath,
		...(author === undefined
			? {}
			: {
					GIT_AUTHOR_NAME: author.name,
					GIT_AUTHOR_EMAIL: author.email,
					GIT_COMMITTER_NAME: author.name,
					GIT_COMMITTER_EMAIL: author.email,
				}),
	};
};

const commitWithSharedIndexGuard = async (
	args: ICommitWithGuardArgs,
): Promise<ICommitWithGuardResult> => {
	const headBefore = await gitStdoutTrimmed(args.run, ['rev-parse', 'HEAD']);
	// x00419 (2026-09-03 log): for non-slice triggers (interval /
	// threshold / manual), the worker's main index may already hold
	// entries from a previous session — `git add -- <allowList>`
	// would NOT clear them, so the post-add `git diff --cached
	// --name-only` would report those pre-existing staged entries
	// as "extras not in trigger files" and we would refuse with
	// CROSS_AGENT_CONTAMINATION. Reset the main index FIRST so the
	// subset check below sees ONLY what we explicitly stage.
	//
	// Slice events do NOT take this path — they go through
	// `commitWithIsolatedIndexGuard` (which uses an isolated index
	// file) and `enforceSubset` is forced on for them via
	// `engine.ts`. The reset below would otherwise wipe a slice's
	// legitimately staged files.
	if (args.sliceContext === undefined) {
		await resetWholeStageSafely(args.run);
	}
	if (args.allowList.length > 0) {
		const addResult = await gitAdd(args.run, args.allowList);
		if (!addResult.ok) {
			return {
				committed: false,
				pushed: false,
				commitCreated: false,
				headMoved: false,
				headBefore,
				headAfter: headBefore,
				refusal: formatGitFailure('add', addResult.reason),
			};
		}
	}

	const staged = [...(await gitCachedNames(args.run))];
	if (args.enforceSubset) {
		const expected = new Set(args.allowList.map(normalizeRepoPath));
		const extras = staged.filter(
			(name) => !expected.has(normalizeRepoPath(name)),
		);
		if (extras.length > 0) {
			await resetWholeStageSafely(args.run);
			// f00417: when the slice resolver produced a scope, an
			// extras-in-stage is a causality breach — not the older
			// CROSS_AGENT_CONTAMINATION (which lives in
			// trigger/interval sweeps). Use the slice-specific code
			// so callers and metrics can distinguish them.
			const refusalCode =
				args.resolvedSliceScope !== undefined
					? 'CAUSALITY_VIOLATION'
					: 'CROSS_AGENT_CONTAMINATION';
			return {
				committed: false,
				pushed: false,
				commitCreated: false,
				headMoved: false,
				headBefore,
				headAfter: headBefore,
				refusal: `${refusalCode}: staged extras not in trigger files=${extras.join(',')}`,
				code: refusalCode,
				trace: {
					commitCreated: false,
					headBefore: headBefore ?? '',
					headAfter: headBefore ?? '',
					stagedSetAtPreCommit: staged,
				},
			};
		}
	}

	const commitResult = await gitCommit(args.run, args.message, {
		authorFlag: args.authorFlag,
	});
	if (!commitResult.ok) {
		await resetStagedPathsSafely(args.run, args.allowList);
		const reason = stripAnsi(commitResult.reason ?? 'unknown');
		const alreadyClean = /nothing to commit|no changes added/u.test(reason);
		return {
			committed: false,
			pushed: false,
			commitCreated: false,
			headMoved: false,
			headBefore,
			headAfter: headBefore,
			refusal: alreadyClean
				? 'nothing to commit (worktree already clean)'
				: formatGitFailure('commit', reason),
			trace: {
				commitCreated: false,
				headBefore: headBefore ?? '',
				headAfter: headBefore ?? '',
				stagedSetAtPreCommit: staged,
			},
		};
	}

	const headAfter =
		(await gitStdoutTrimmed(args.run, ['rev-parse', 'HEAD'])) ??
		headBefore ??
		'';
	const hash = await gitHeadShortHash(args.run);
	return {
		committed: true,
		pushed: false,
		commitCreated: true,
		headMoved: headBefore !== undefined && headAfter !== headBefore,
		headBefore: headBefore ?? '',
		headAfter,
		...(hash !== undefined ? { hash } : {}),
		trace: {
			commitCreated: true,
			headBefore: headBefore ?? '',
			headAfter,
			stagedSetAtPreCommit: staged,
		},
	};
};

export const commitWithGuard = async (
	args: ICommitWithGuardArgs,
): Promise<ICommitWithGuardResult> => {
	if (args.workspaceRoot === undefined || args.branch === undefined) {
		return commitWithSharedIndexGuard(args);
	}

	const headBefore = await gitStdoutTrimmed(args.run, ['rev-parse', 'HEAD']);
	const tmpDir = await mkdtemp(join(tmpdir(), 'cp-index-'));
	const isolatedRun = createGitRunnerWithEnv(
		args.workspaceRoot,
		buildIsolatedGitEnv(join(tmpDir, 'index'), args.authorFlag),
		args.gitTimeoutMs,
	);
	const lockPath = join(args.workspaceRoot, '.mcp-vertex', 'index-lock');
	return await withFileMutex(
		lockPath,
		async () => {
			try {
				if (headBefore !== undefined) {
					const readTreeResult = await isolatedRun([
						'read-tree',
						'HEAD',
					]);
					if (!readTreeResult.ok) {
						return {
							committed: false,
							pushed: false,
							commitCreated: false,
							headMoved: false,
							headBefore,
							headAfter: headBefore,
							refusal: `git read-tree failed: ${readTreeResult.reason ?? 'unknown'}`,
						};
					}
				}

				if (args.allowList.length > 0) {
					const addResult = await gitAdd(isolatedRun, args.allowList);
					if (!addResult.ok) {
						return {
							committed: false,
							pushed: false,
							commitCreated: false,
							headMoved: false,
							headBefore,
							headAfter: headBefore,
							refusal: formatGitFailure('add', addResult.reason),
						};
					}
				}

				const staged = [...(await gitCachedNames(isolatedRun))];
				if (args.enforceSubset) {
					const expected = new Set(
						args.allowList.map(normalizeRepoPath),
					);
					const extras = staged.filter(
						(name) => !expected.has(normalizeRepoPath(name)),
					);
					if (extras.length > 0) {
						await resetWholeStageSafely(isolatedRun);
						return {
							committed: false,
							pushed: false,
							commitCreated: false,
							headMoved: false,
							headBefore,
							headAfter: headBefore,
							refusal: `CROSS_AGENT_CONTAMINATION: staged extras not in trigger files=${extras.join(',')}`,
							trace: {
								commitCreated: false,
								headBefore: headBefore ?? '',
								headAfter: headBefore ?? '',
								stagedSetAtPreCommit: staged,
							},
						};
					}
				}

				const writeTreeResult = await isolatedRun(['write-tree']);
				if (!writeTreeResult.ok) {
					return {
						committed: false,
						pushed: false,
						commitCreated: false,
						headMoved: false,
						headBefore,
						headAfter: headBefore,
						refusal: `git write-tree failed: ${writeTreeResult.reason ?? 'unknown'}`,
					};
				}
				const tree = writeTreeResult.output.trim();

				const headTree =
					headBefore === undefined
						? undefined
						: await gitStdoutTrimmed(args.run, [
								'rev-parse',
								'HEAD^{tree}',
							]);
				if (headTree !== undefined && tree === headTree) {
					return {
						committed: false,
						pushed: false,
						commitCreated: false,
						headMoved: false,
						headBefore,
						headAfter: headBefore,
						refusal: 'nothing to commit (worktree already clean)',
						trace: {
							commitCreated: false,
							headBefore: headBefore ?? '',
							headAfter: headBefore ?? '',
							stagedSetAtPreCommit: staged,
						},
					};
				}

				const commitTreeArgs =
					headBefore === undefined
						? ['commit-tree', tree, '-m', args.message]
						: [
								'commit-tree',
								tree,
								'-p',
								headBefore,
								'-m',
								args.message,
							];
				const commitTreeResult = await isolatedRun(commitTreeArgs);
				if (!commitTreeResult.ok) {
					return {
						committed: false,
						pushed: false,
						commitCreated: false,
						headMoved: false,
						headBefore,
						headAfter: headBefore,
						refusal: `git commit-tree failed: ${commitTreeResult.reason ?? 'unknown'}`,
						trace: {
							commitCreated: false,
							headBefore: headBefore ?? '',
							headAfter: headBefore ?? '',
							stagedSetAtPreCommit: staged,
						},
					};
				}
				const headAfter = commitTreeResult.output.trim();

				const updateRefResult = await isolatedRun(
					headBefore === undefined
						? ['update-ref', `refs/heads/${args.branch}`, headAfter]
						: [
								'update-ref',
								`refs/heads/${args.branch}`,
								headAfter,
								headBefore,
							],
				);
				if (!updateRefResult.ok) {
					return {
						committed: false,
						pushed: false,
						commitCreated: false,
						headMoved: false,
						headBefore,
						headAfter: headBefore,
						refusal: `git update-ref failed: ${updateRefResult.reason ?? 'unknown'}`,
						trace: {
							commitCreated: false,
							headBefore: headBefore ?? '',
							headAfter: headBefore ?? '',
							stagedSetAtPreCommit: staged,
						},
					};
				}

				const realStagedPaths = await gitCachedNames(args.run);
				await preserveRealIndexAfterIsolatedCommit(
					args.run,
					realStagedPaths.filter(
						(path) =>
							!staged.some(
								(isolatedPath) => isolatedPath === path,
							),
					),
				);

				const hash = await gitHeadShortHash(args.run);
				return {
					committed: true,
					pushed: false,
					commitCreated: true,
					headMoved:
						headBefore === undefined || headAfter !== headBefore,
					headBefore: headBefore ?? '',
					headAfter,
					...(hash !== undefined ? { hash } : {}),
					trace: {
						commitCreated: true,
						headBefore: headBefore ?? '',
						headAfter,
						stagedSetAtPreCommit: staged,
					},
				};
			} finally {
				await rm(tmpDir, { recursive: true, force: true }).catch(
					() => undefined,
				);
			}
		},
		{ onContention: 'wait', timeoutMs: 120_000, staleMs: 300_000 },
	);
};

const runCommitDriverUnlocked = async (
	input: ICommitDriverInput,
	options: ICommitDriverOptions,
): Promise<ICommitDriverResult> => {
	const scopeSliceCommit =
		options.policy.cadence.sliceScoping &&
		options.policy.cadence.allowForeignChanges !== true;
	if (!options.policy.commit.enabled) {
		return {
			committed: false,
			pushed: false,
			commitCreated: false,
			headMoved: false,
			refusal: 'commit.enabled is false in plugins.commit-policy.options',
		};
	}

	const identity = await resolveAuthor(
		options.policy.identity,
		options.identityCtx,
	);
	if (!identity.ok) {
		return {
			committed: false,
			pushed: false,
			commitCreated: false,
			headMoved: false,
			refusal: identity.reason,
		};
	}

	const branch = await gitCurrentBranch(options.run);
	if (branch === undefined) {
		// detached HEAD or not a repo — refuse explicitly so the
		// agent knows it has to switch to a branch.
		return {
			committed: false,
			pushed: false,
			commitCreated: false,
			headMoved: false,
			refusal:
				'commit refused: HEAD is detached. Check out a branch first.',
		};
	}
	// x00267 (AUD-CP-009): branch protection is unified across
	// every commit path — manual, slice, threshold, interval.
	// The previous behaviour gated the check on `sliceContext`
	// which let threshold / interval commits bypass the
	// configured branch policy entirely. The same list feeds
	// the push scheduler (x00266).
	// c00145: the effective protected list is resolved through
	// `resolveProtectedBranches` (empty by default; explicit config
	// wins; agent/worktree branches are never protected).
	const effectiveProtectedBranches = resolveProtectedBranches(
		options.policy.push.protectedBranches,
	);
	if (
		isBranchProtected(branch, {
			protected: effectiveProtectedBranches,
			protectedPrefixes: options.policy.push.protectedPrefixes,
		})
	) {
		return {
			committed: false,
			pushed: false,
			commitCreated: false,
			headMoved: false,
			refusal: branchProtectedRefusal(branch ?? '(detached)', {
				protected: effectiveProtectedBranches,
				protectedPrefixes: options.policy.push.protectedPrefixes,
			}),
		};
	}

	const baseMessage =
		input.sliceContext !== undefined
			? buildScopedMessage(
					input.message,
					input.sliceContext.proposalId,
					options.policy.commit.autoScopeFromProposal,
				)
			: input.message;

	// x00265 (AUD-CP-007): when requireConventional is on, validate
	// the header before passing the message to git. The previous
	// behaviour let agents commit `"hola"`, `"updated stuff"`, `"WIP"`
	// and break the repo's traceability. Refusal codes are specific
	// so the caller can correct the input. f00182 will lift this
	// into the engine layer.
	if (options.policy.commit.requireConventional) {
		const verdict = validateConventionalHeader(baseMessage);
		if (verdict.status !== 'OK') {
			return {
				committed: false,
				pushed: false,
				commitCreated: false,
				headMoved: false,
				refusal: `NON_CONVENTIONAL_MESSAGE: ${verdict.status}`,
			};
		}
	}

	const finalMessage = appendAuditTrailer(
		baseMessage,
		options.policy.audit.trailer,
		options.policy.audit.agentFormat,
		options.auditAgent,
	);

	const files =
		input.sliceContext !== undefined && scopeSliceCommit
			? input.sliceContext.files
			: (input.files ??
				(input.triggerContext !== undefined
					? input.triggerContext.files
					: input.sliceContext !== undefined
						? await gitDirtyFilePaths(options.run)
						: []));

	// x00263 (AUD-CP-005): when sliceScoping is on and the slice
	// declared no files, refuse rather than fall back to
	// `skipAdd: true`. The previous behaviour allowed an empty
	// list to "stage whatever the worktree had", which is the
	// root cause of the cross-agent contamination finding.
	if (
		input.sliceContext !== undefined &&
		scopeSliceCommit &&
		files.length === 0
	) {
		return {
			committed: false,
			pushed: false,
			commitCreated: false,
			headMoved: false,
			refusal: `SLICE_HAS_NO_FILES: ${input.sliceContext.proposalId}-${input.sliceContext.sliceId}`,
		};
	}
	if (
		input.sliceContext !== undefined &&
		!options.policy.cadence.sliceScoping &&
		files.length === 0
	) {
		return {
			committed: false,
			pushed: false,
			commitCreated: false,
			headMoved: false,
			refusal: `WORKSPACE_HAS_NO_FILES: ${input.sliceContext.proposalId}-${input.sliceContext.sliceId}`,
		};
	}

	// x00264 (AUD-CP-006): a non-slice trigger fired with zero
	// dirty paths. Same fail-closed semantics as the slice case
	// — an implicit `skipAdd: true` would let the driver commit
	// whatever happened to be staged, which has nothing to do
	// with the predicate that fired.
	if (input.triggerContext !== undefined && files.length === 0) {
		return {
			committed: false,
			pushed: false,
			commitCreated: false,
			headMoved: false,
			refusal: `TRIGGER_HAS_NO_FILES: ${input.triggerContext.kind} fired with zero dirty paths`,
		};
	}

	// Drop anything another agent is still holding — but ONLY when this
	// file list came from the workspace rather than from the caller.
	//
	// That distinction is the whole safety argument. A sweep (an
	// interval or threshold trigger, or a slice commit under
	// `sliceScoping: false`) stages whatever happens to be dirty, so it
	// can capture an edit that is not finished; that is the case worth
	// protecting. An explicit `files` list or a scoped slice list is the
	// caller naming its own work, and withholding there would depend on
	// this plugin's idea of "who am I" matching the lock file's — which
	// it has no way to guarantee. Guessing wrong would refuse an agent's
	// commit of its own claimed slice, turning a safeguard against
	// deadlock into a cause of one. So the filter is applied exactly
	// where it cannot misfire.
	const isWorkspaceDerived =
		input.triggerContext !== undefined ||
		(input.sliceContext !== undefined && !scopeSliceCommit);
	const lockFilter = isWorkspaceDerived
		? await filterForeignLockedFiles({
				files,
				...(options.selfAgent !== undefined
					? { selfAgent: options.selfAgent }
					: { selfAgent: undefined }),
				provider: options.foreignLocks,
			})
		: { files, withheld: [] as const };
	if (lockFilter.files.length === 0 && lockFilter.withheld.length > 0) {
		return {
			committed: false,
			pushed: false,
			commitCreated: false,
			headMoved: false,
			refusal: buildForeignLockRefusal(lockFilter.withheld),
		};
	}
	const withheldForeignLocks = lockFilter.withheld.map(
		(holding) => holding.file,
	);
	const normalizedFiles = lockFilter.files.map(normalizeStagePath);
	const result = await commitWithGuard({
		run: options.run,
		message: finalMessage,
		authorFlag: identity.author.authorFlag,
		allowList: normalizedFiles,
		branch,
		enforceSubset:
			input.triggerContext !== undefined ||
			input.sliceContext !== undefined,
		...(input.resolvedSliceScope !== undefined
			? { resolvedSliceScope: input.resolvedSliceScope }
			: {}),
		...(options.policy.gitTimeoutMs !== undefined
			? { gitTimeoutMs: options.policy.gitTimeoutMs }
			: {}),
		...(options.workspaceRoot !== undefined
			? { workspaceRoot: options.workspaceRoot }
			: {}),
	});
	if (!result.committed) {
		return withheldForeignLocks.length > 0
			? { ...result, withheldForeignLocks }
			: result;
	}

	return {
		...result,
		...(withheldForeignLocks.length > 0 ? { withheldForeignLocks } : {}),
		resolvedAuthor: {
			displayName: identity.author.displayName,
			email: identity.author.email,
			label: identity.author.label,
		},
	};
};

export const runCommitDriver = async (
	input: ICommitDriverInput,
	options: ICommitDriverOptions,
): Promise<ICommitDriverResult> => {
	const result = await runCommitDriverUnlocked(input, options);
	return result.refusal === undefined
		? result
		: { ...result, code: classifyRefusal(result.refusal) };
};
