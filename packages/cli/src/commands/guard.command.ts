/**
 * `delendai guard <hook>` — git asks the project's development policy.
 *
 * Installed hooks call this, so every commit, branch creation and push is
 * judged whoever runs it: an agent through delendai, an agent with a
 * shell, another host's subagent or a human. It runs offline (no MCP
 * server), reads only git and the project's own configuration, and
 * refuses nothing when the project declares no development policy.
 */
import { execFileSync } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';

import { judgeGitOperation } from '@delendai/core/cli';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';
import type { IGuardedGitOperation } from '@delendai/core/cli';
import { agentEnvironmentMarker } from '@delendai/core/cli';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import type {
	IGuardFacts,
	IGuardedHook,
} from '../contracts/interfaces/guard.interface';
import {
	readWorkspaceDocsDir,
	readWorkspacePolicy,
	worktreeAgent,
} from '@delendai/core/cli';
import {
	inspectGuardHooks,
	installGuardHooks,
	managerReason,
	uninstallGuardHooks,
} from '../lib/guard-hooks.service';
import type { IGuardHooksReport } from '../contracts/interfaces/guard-hooks-service.interface';
import type { IGeneratedMergeDriverReport } from '../contracts/interfaces/generated-merge-driver.interface';
import { GENERATED_MERGE_DRIVER_SCRIPT } from '../contracts/constants/generated-merge-driver.constant';
import { refreshGeneratedAfterMerge } from '../lib/generated-refresh.service';
import { GENERATED_REFRESH_PATHS } from '../contracts/constants/generated-refresh.constant';
import {
	inspectGeneratedMergeDriver,
	installGeneratedMergeDriver,
	uninstallGeneratedMergeDriver,
} from '../lib/generated-merge-driver.service';

const ZERO_OID = /^0+$/u;

const lines = (text: string): string[][] =>
	text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => line.split(/\s+/u));

/**
 * The operations one hook invocation asks about. `reference-transaction`
 * is judged only in its `prepared` state, where a refusal aborts the
 * transaction: refs being created, and any write to `refs/stash`.
 */
export const operationsForHook = (
	hook: IGuardedHook,
	hookArgs: readonly string[],
	stdin: string,
	facts: {
		readonly branch: string | undefined;
		readonly isMerge: boolean;
		readonly inMainWorktree?: boolean;
		readonly author?: string | undefined;
		readonly configuredAuthor?: string | undefined;
		readonly tipKept?: IGuardFacts['tipKept'];
		readonly refAt?: IGuardFacts['refAt'];
		readonly worktreeOf?: IGuardFacts['worktreeOf'];
		readonly paths?: readonly string[] | undefined;
		readonly docsDir?: string | undefined;
	},
): IGuardedGitOperation[] => {
	if (hook === 'pre-commit' || hook === 'commit-msg') {
		return [
			{
				kind: 'commit',
				branch: facts.branch,
				isMerge: facts.isMerge,
				inMainWorktree: facts.inMainWorktree ?? true,
				author: facts.author,
				configuredAuthor: facts.configuredAuthor,
				paths: facts.paths,
				docsDir: facts.docsDir,
			},
		];
	}
	if (hook === 'reference-transaction') {
		if (hookArgs[0] !== 'prepared') return [];
		return lines(stdin).flatMap(
			([oldOid, newOid, ref]): IGuardedGitOperation[] => {
				if (
					oldOid === undefined ||
					newOid === undefined ||
					ref === undefined
				)
					return [];
				// A branch being deleted: judged only when a worktree still
				// works on it, the case `update-ref -d` never asks about.
				if (ZERO_OID.test(newOid)) {
					if (!ref.startsWith('refs/heads/')) return [];
					const worktree = facts.worktreeOf?.(ref);
					return worktree === undefined
						? []
						: [{ kind: 'branch-delete', ref, worktree }];
				}
				// Every write to the stash, not only the first: a stash on
				// top of an existing one updates the ref instead of creating
				// it, and judging creations alone let every stash after the
				// first through.
				if (ref === 'refs/stash') return [{ kind: 'stash' }];
				if (!ZERO_OID.test(oldOid)) return [];
				// `git pack-refs` (run by gc) moves every loose ref into the
				// packed store in a transaction that reads as a creation. A
				// ref that already points at the same commit is being packed,
				// not created: judged as a creation, one badly named ref
				// stopped git's maintenance for the whole repository (x00703).
				if (facts.refAt?.(ref) === newOid) return [];
				return [{ kind: 'branch-create', ref }];
			},
		);
	}
	return lines(stdin).flatMap(
		([localRef, localOid, remoteRef, remoteOid]) => {
			if (
				localRef === undefined ||
				localOid === undefined ||
				remoteRef === undefined
			) {
				return [];
			}
			const deleting = ZERO_OID.test(localOid);
			const deletedTipKept =
				deleting && remoteOid !== undefined && !ZERO_OID.test(remoteOid)
					? facts.tipKept?.(remoteOid, remoteRef)
					: undefined;
			return [
				{
					kind: 'push' as const,
					remoteRef,
					deleting,
					...(deletedTipKept === undefined ? {} : { deletedTipKept }),
				},
			];
		},
	);
};

const git = (
	workspace: string,
	args: readonly string[],
): string | undefined => {
	try {
		return execFileSync('git', [...args], {
			cwd: workspace,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return undefined;
	}
};

/** Everything a stream carries; git closes a hook's stdin when done. */
export const readStream = async (
	stream: AsyncIterable<unknown> & { readonly isTTY?: boolean },
): Promise<string> => {
	if (stream.isTTY === true) return '';
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(
			Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)),
		);
	}
	return Buffer.concat(chunks).toString('utf8');
};

/** What the guard reads from real git and the project's configuration. */
export const defaultGuardFacts = (workspace: string): IGuardFacts => ({
	branch: () => {
		const name = git(workspace, ['symbolic-ref', '--short', '-q', 'HEAD']);
		return name === undefined || name === '' ? undefined : name;
	},
	isMerge: () =>
		git(workspace, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']) !==
		undefined,
	// A linked worktree has its own `.git` directory; the main one is the
	// common directory itself. That difference is what separates "an
	// agent working in its own worktree" from "somebody moved the shared
	// checkout", and only git can answer it.
	inMainWorktree: () =>
		git(workspace, ['rev-parse', '--git-dir']) ===
		git(workspace, ['rev-parse', '--git-common-dir']),
	worktreeAgent: () => worktreeAgent(workspace),
	refAt: (ref) => git(workspace, ['rev-parse', '--verify', '--quiet', ref]),
	worktreeOf: (ref) => {
		const blocks = (
			git(workspace, ['worktree', 'list', '--porcelain']) ?? ''
		).split('\n\n');
		const block = blocks.find((each) =>
			each.split('\n').includes(`branch ${ref}`),
		);
		return block
			?.split('\n')
			.find((line) => line.startsWith('worktree '))
			?.slice('worktree '.length);
	},
	tipKept: (sha, deletedRef) => {
		if (git(workspace, ['cat-file', '-e', `${sha}^{commit}`]) === undefined)
			return undefined;
		const branch = deletedRef.replace(/^refs\/heads\//u, '');
		const holders = (
			git(workspace, [
				'for-each-ref',
				'--contains',
				sha,
				'--format=%(refname)',
			]) ?? ''
		)
			.split('\n')
			.filter((ref) => ref.length > 0)
			// The branch being deleted does not keep its own work, whether
			// named locally or as any remote's tracking ref.
			.filter(
				(ref) =>
					ref !== `refs/heads/${branch}` &&
					!(
						ref.startsWith('refs/remotes/') &&
						ref.endsWith(`/${branch}`)
					),
			);
		return holders.length > 0;
	},
	// What git will author the commit as — `--author`, `-c user.*` and
	// `GIT_AUTHOR_*` all show here — without its timestamp.
	author: () =>
		git(workspace, ['var', 'GIT_AUTHOR_IDENT'])?.replace(/>.*$/u, '>'),
	// The identity the repository is configured with: the same read with
	// the command line's `-c` overrides taken away.
	configuredAuthor: () => {
		const configured = (args: readonly string[]): string | undefined => {
			try {
				return execFileSync('git', ['config', ...args], {
					cwd: workspace,
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'ignore'],
					env: {
						...process.env,
						GIT_CONFIG_PARAMETERS: '',
						GIT_CONFIG_COUNT: '0',
					},
				}).trim();
			} catch {
				return undefined;
			}
		};
		// The owner's identity lives in the global (or system) config. The
		// repository's own config is shared by every worktree, and an agent
		// that wrote `user.name` there made every agent commit as itself
		// and passed this very check (x00698); a repository-level identity
		// that differs from the owner's is exactly the borrowed author.
		const owner = (key: string): string | undefined =>
			configured(['--global', '--get', key]) ??
			configured(['--system', '--get', key]);
		const name = owner('user.name') ?? configured(['--get', 'user.name']);
		const email =
			owner('user.email') ?? configured(['--get', 'user.email']);
		return name === undefined || email === undefined
			? undefined
			: `${name} <${email}>`;
	},
	stagedPaths: () =>
		git(workspace, ['diff', '--cached', '--name-only', '--no-renames'])
			?.split('\n')
			.filter((path) => path.length > 0),
	docsDir: (root) => readWorkspaceDocsDir(root),
	stdin: () => readStream(process.stdin),
	// One reader for every entry point: the guard and `delendai work`
	// must never disagree about what the project declared.
	policy: async (root) => readWorkspacePolicy(root),
});

const HOOKS: readonly IGuardedHook[] = [
	'pre-commit',
	'commit-msg',
	'reference-transaction',
	'pre-push',
	'post-checkout',
	'post-merge',
];

/**
 * What to say when the shared checkout has just left the integration
 * node. Git runs `post-checkout` AFTER the move, so there is nothing to
 * refuse here — the refusal lives in `pre-commit`, and this exists so the
 * mistake is visible at the moment it is made instead of on the next
 * boot. Empty when there is nothing to say.
 */
export const checkoutWarning = (
	policy: IResolvedDevelopmentPolicy,
	facts: {
		readonly branch: string | undefined;
		readonly inMainWorktree: boolean;
	},
	hookArgs: readonly string[],
): string => {
	// The third argument is 1 for a branch checkout, 0 for a file one.
	if (hookArgs[2] !== '1') return '';
	if (!policy.workspace.pinnedCheckout || !facts.inMainWorktree) return '';
	const branch = facts.branch;
	if (branch === undefined || branch === policy.branches.integration) {
		return '';
	}
	return [
		`delendai guard (post-checkout): the shared checkout is now on \`${branch}\`.`,
		`The \`${policy.profile}\` development profile anchors it to \`${policy.branches.integration}\`, and commits from here will be refused.`,
		`Return with \`git switch ${policy.branches.integration}\` (your edits stay), then persist work with \`delendai work checkpoint\`, or take your own worktree with \`delendai work enter\`.`,
	].join('\n');
};

const flag = (args: readonly string[], name: string): string | undefined =>
	args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

/**
 * The report, for a human and for a script. A result carrying `data` is
 * printed as JSON by the runner unless the command says it printed
 * itself, and `text` is used only when there is no `data` — so the lines
 * are written here, and `--json` gets the envelope.
 */
const isManagerOwned = (reason: string | undefined): boolean =>
	reason === managerReason('lefthook') ||
	reason === managerReason('husky-v9');

const reported = (
	report: IGuardHooksReport,
	ctx: ICliCommandContext,
	driver?: IGeneratedMergeDriverReport,
	alongsideManager = false,
): ICliCommandResult => {
	// `--alongside-manager` asks only for the hooks no manager owns, so a
	// hook the manager owns is expected, not a failure. A hook that could
	// not be installed for any other reason still fails.
	const failed = report.hooks.some(
		(entry) =>
			entry.state === 'unsupported' &&
			!(alongsideManager && isManagerOwned(entry.reason)),
	);
	const code = failed ? EXIT_CODE.VALIDATION : EXIT_CODE.OK;
	const data = driver === undefined ? report : { ...report, driver };
	if (ctx.globals.json || ctx.globals.format === 'json') {
		return { code, data };
	}
	process.stdout.write(
		`${[
			`hooks: ${report.dir}`,
			...report.hooks.map(
				(entry) =>
					`  ${entry.hook}: ${entry.state}${entry.reason === undefined ? '' : ` — ${entry.reason}`}`,
			),
		].join('\n')}\n`,
	);
	if (driver !== undefined) {
		process.stdout.write(
			`generated-file merges: ${driver.state}${driver.reason === undefined ? '' : ` — ${driver.reason}`}\n`,
		);
	}
	return { code, data, suppressDefaultPrint: true };
};

/**
 * `install` embeds how THIS process reached the CLI (its runner and entry),
 * so the hooks call the delendai that installed them; `--runner` and
 * `--entry` override both.
 */
const MANAGEMENT = new Map<
	string,
	(
		args: readonly string[],
		ctx: ICliCommandContext,
	) => ICliCommandResult | Promise<ICliCommandResult>
>(
	Object.entries({
		install: (args, ctx) => {
			const runner = flag(args, 'runner') ?? process.execPath;
			const driverFor = () =>
				installGeneratedMergeDriver(ctx.globals.workspace, {
					runner,
					// Only an EXPLICIT --runner overrides resolution; the
					// default is the observed process, which may be unable
					// to run the script at all.
					explicitRunner: flag(args, 'runner'),
					script: resolvePath(
						ctx.globals.workspace,
						GENERATED_MERGE_DRIVER_SCRIPT,
					),
				});
			// `--driver-only` exists because this command reports a hook it
			// cannot own as `unsupported`, and answers VALIDATION when any
			// hook is — which is right when somebody asked for the hooks and
			// did not get them.
			//
			// In a project where another manager owns the hook FILES, every
			// hook is unsupported by design, so the command can never exit 0
			// there. Putting it in `prepare` as-is made `bun install` fail on
			// every clone. The two halves are separable: `prepare` installs
			// the hooks through that manager and needs only the other half,
			// which git cannot take from the repository and nothing else
			// configures.
			if (args.includes('--driver-only')) {
				const driver = driverFor();
				const ok =
					driver.state !== 'unsupported' && driver.state !== 'absent';
				return {
					code: ok ? EXIT_CODE.OK : EXIT_CODE.VALIDATION,
					data: { driver },
					text: `generated-file merges: ${driver.state}${driver.reason === undefined ? '' : ` — ${driver.reason}`}`,
				};
			}
			return reported(
				installGuardHooks(ctx.globals.workspace, {
					runner,
					entry:
						flag(args, 'entry') ??
						resolvePath(process.argv[1] ?? ''),
				}),
				ctx,
				// Same installer, because a clone that enforces the policy and
				// still hand-resolves its own generated files is only half set
				// up (x00559).
				driverFor(),
				args.includes('--alongside-manager'),
			);
		},
		uninstall: (_args, ctx) =>
			reported(
				uninstallGuardHooks(ctx.globals.workspace),
				ctx,
				uninstallGeneratedMergeDriver(ctx.globals.workspace),
			),
		status: (_args, ctx) =>
			reported(
				inspectGuardHooks(ctx.globals.workspace),
				ctx,
				inspectGeneratedMergeDriver(ctx.globals.workspace),
			),
	}),
);

export const createGuardCommand = (
	factsFor: (workspace: string) => IGuardFacts = defaultGuardFacts,
): ICliCommand => ({
	name: 'guard',
	summary:
		'Refuse the git operations the project development policy forbids (called from git hooks).',
	usage: 'guard <install [--runner=<path>] [--entry=<path>]|uninstall|status|pre-commit|commit-msg|reference-transaction|pre-push|post-checkout|post-merge> [hook args]',
	async run(args, ctx): Promise<ICliCommandResult> {
		const [hook, ...hookArgs] = args;
		// A Map, not an object indexed by user input: `delendai guard
		// toString` used to resolve an inherited member instead of
		// reaching the unknown-command answer (x00558 S4).
		const manage = MANAGEMENT.get(hook ?? '');
		if (manage !== undefined) return manage(hookArgs, ctx);
		if (!HOOKS.includes(hook as IGuardedHook)) {
			return {
				code: EXIT_CODE.USAGE,
				error: `guard: unknown hook ${String(hook)}; expected ${HOOKS.join(', ')}`,
			};
		}
		const workspace = ctx.globals.workspace;
		const facts = factsFor(workspace);
		let policy: Awaited<ReturnType<IGuardFacts['policy']>>;
		try {
			policy = await facts.policy(workspace);
		} catch (error) {
			// A policy that is DECLARED and unreadable is not the same as
			// no policy, and this returned OK for both.
			//
			// The old reasoning — say so rather than block every git
			// operation — trades the wrong way round. A project with a
			// broken `delendai.config.json` is a project whose rules
			// nobody is applying, and the operations this hook guards are
			// exactly the ones the rules exist for: committing to the
			// integration branch, pushing an unproven publication. Passing
			// them because the rulebook is unreadable is the fail-open
			// shape this cycle has now found three times.
			//
			// Refusing is recoverable in one edit and names it. Passing is
			// recoverable only by noticing later.
			process.stderr.write(
				`${[
					`delendai guard: the development policy is declared but could not be read — ${error instanceof Error ? error.message : String(error)}`,
					'  Nothing was checked, so nothing is authorised: a guard that passes when it cannot read its rules is not a guard.',
					'  Fix `delendai.config.json`, or remove the `development` block if this project has no policy.',
				].join('\n')}\n`,
			);
			return { code: EXIT_CODE.VALIDATION };
		}
		if (policy === undefined) return { code: EXIT_CODE.OK };
		// An agent is recognised by its runtime's variable or, whatever the
		// runtime, by the worktree `work enter` made for it (x00688).
		// A worktree made before the stamp existed still says whose it is:
		// a linked worktree on a work branch belongs to the agent the branch
		// names.
		const workPrefix = policy.branches.workRefPrefix
			.replace(/^refs\//u, '')
			.replace(/^heads\//u, '');
		const onWorkBranch =
			!facts.inMainWorktree() &&
			workPrefix.length > 0 &&
			(facts.branch() ?? '').startsWith(workPrefix)
				? (facts.branch() ?? '').slice(workPrefix.length).split('/')[0]
				: undefined;
		const stamped =
			facts.worktreeAgent?.() ??
			(onWorkBranch !== undefined && onWorkBranch.length > 0
				? onWorkBranch
				: undefined);
		const agentMarker =
			agentEnvironmentMarker(process.env) ??
			(stamped === undefined
				? undefined
				: `the worktree delendai made for ${stamped}`);
		if (hook === 'post-checkout') {
			// A warning is still a limit on how somebody uses their own
			// checkout; it is for agents, like every other verdict here.
			if (agentMarker === undefined) {
				return { code: EXIT_CODE.OK };
			}
			const warning = checkoutWarning(
				policy,
				{
					branch: facts.branch(),
					inMainWorktree: facts.inMainWorktree(),
				},
				hookArgs,
			);
			if (warning.length > 0) process.stderr.write(`${warning}\n`);
			return { code: EXIT_CODE.OK };
		}
		// A merge that resolved a generated file did so mid-tree; here the
		// tree is finished, so the generators run against what landed
		// (x00559). It never refuses: a merge has already happened.
		if (hook === 'post-merge') {
			const outcome = refreshGeneratedAfterMerge({
				root: workspace,
				paths: GENERATED_REFRESH_PATHS,
			});
			if (outcome.failed.length > 0) {
				process.stderr.write(
					`delendai guard (post-merge): ${outcome.failed.join(', ')} failed; the generated files were left as the merge produced them.\n`,
				);
			}
			// A refusal here is the policy working — on the integration
			// branch, in the shared checkout, nothing may commit. Saying
			// nothing would leave the tree dirty with a file the next
			// agent would have to explain to itself.
			if (outcome.paths.length > 0 && !outcome.committed) {
				process.stderr.write(
					`delendai guard (post-merge): regenerated ${outcome.paths.join(', ')}, and could not commit ${outcome.paths.length === 1 ? 'it' : 'them'} here. The change is staged; land it through a pull request.\n`,
				);
			}
			return { code: EXIT_CODE.OK };
		}
		const commits = hook === 'pre-commit' || hook === 'commit-msg';
		const operations = operationsForHook(
			hook as IGuardedHook,
			hookArgs,
			commits ? '' : await facts.stdin(),
			{
				branch: facts.branch(),
				isMerge: facts.isMerge(),
				inMainWorktree: facts.inMainWorktree(),
				...(facts.tipKept === undefined
					? {}
					: { tipKept: facts.tipKept }),
				...(facts.refAt === undefined ? {} : { refAt: facts.refAt }),
				...(facts.worktreeOf === undefined
					? {}
					: { worktreeOf: facts.worktreeOf }),
				...(commits
					? {
							author: facts.author?.(),
							configuredAuthor: facts.configuredAuthor?.(),
							paths: facts.stagedPaths?.(),
							docsDir: await facts.docsDir?.(workspace),
						}
					: {}),
			},
		);
		for (const operation of operations) {
			const verdict = judgeGitOperation(policy, operation, {
				agentMarker,
			});
			if (!verdict.refused) continue;
			return {
				code: EXIT_CODE.VALIDATION,
				error: [
					`delendai guard (${String(hook)}): refused — ${verdict.reason}`,
					...(verdict.remedy === undefined ? [] : [verdict.remedy]),
				].join('\n'),
			};
		}
		return { code: EXIT_CODE.OK };
	},
});

export const guardCommand: ICliCommand = createGuardCommand();
