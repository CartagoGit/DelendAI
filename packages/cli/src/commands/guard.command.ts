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
import { readWorkspacePolicy } from '../lib/development-policy.service';
import {
	inspectGuardHooks,
	installGuardHooks,
	uninstallGuardHooks,
} from '../lib/guard-hooks.service';
import type { IGuardHooksReport } from '../contracts/interfaces/guard-hooks-service.interface';

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
 * transaction, and only for refs being created.
 */
export const operationsForHook = (
	hook: IGuardedHook,
	hookArgs: readonly string[],
	stdin: string,
	facts: {
		readonly branch: string | undefined;
		readonly isMerge: boolean;
		readonly inMainWorktree?: boolean;
	},
): IGuardedGitOperation[] => {
	if (hook === 'pre-commit') {
		return [
			{
				kind: 'commit',
				branch: facts.branch,
				isMerge: facts.isMerge,
				inMainWorktree: facts.inMainWorktree ?? true,
			},
		];
	}
	if (hook === 'reference-transaction') {
		if (hookArgs[0] !== 'prepared') return [];
		return lines(stdin).flatMap(([oldOid, newOid, ref]) =>
			oldOid !== undefined &&
			newOid !== undefined &&
			ref !== undefined &&
			ZERO_OID.test(oldOid) &&
			!ZERO_OID.test(newOid)
				? [{ kind: 'branch-create' as const, ref }]
				: [],
		);
	}
	return lines(stdin).flatMap(([localRef, localOid, remoteRef]) =>
		localRef !== undefined &&
		localOid !== undefined &&
		remoteRef !== undefined
			? [
					{
						kind: 'push' as const,
						remoteRef,
						deleting: ZERO_OID.test(localOid),
					},
				]
			: [],
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
	stdin: () => readStream(process.stdin),
	// One reader for every entry point: the guard and `delendai work`
	// must never disagree about what the project declared.
	policy: async (root) => readWorkspacePolicy(root),
});

const HOOKS: readonly IGuardedHook[] = [
	'pre-commit',
	'reference-transaction',
	'pre-push',
	'post-checkout',
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
const reported = (
	report: IGuardHooksReport,
	ctx: ICliCommandContext,
): ICliCommandResult => {
	const code = report.hooks.some((entry) => entry.state === 'unsupported')
		? EXIT_CODE.VALIDATION
		: EXIT_CODE.OK;
	if (ctx.globals.json || ctx.globals.format === 'json') {
		return { code, data: report };
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
	return { code, data: report, suppressDefaultPrint: true };
};

/**
 * `install` embeds how THIS process reached the CLI (its runner and entry),
 * so the hooks call the delendai that installed them; `--runner` and
 * `--entry` override both.
 */
const MANAGEMENT: Readonly<
	Record<
		string,
		(
			args: readonly string[],
			ctx: ICliCommandContext,
		) => ICliCommandResult | Promise<ICliCommandResult>
	>
> = {
	install: (args, ctx) =>
		reported(
			installGuardHooks(ctx.globals.workspace, {
				runner: flag(args, 'runner') ?? process.execPath,
				entry:
					flag(args, 'entry') ?? resolvePath(process.argv[1] ?? ''),
			}),
			ctx,
		),
	uninstall: (_args, ctx) =>
		reported(uninstallGuardHooks(ctx.globals.workspace), ctx),
	status: (_args, ctx) =>
		reported(inspectGuardHooks(ctx.globals.workspace), ctx),
};

export const createGuardCommand = (
	factsFor: (workspace: string) => IGuardFacts = defaultGuardFacts,
): ICliCommand => ({
	name: 'guard',
	summary:
		'Refuse the git operations the project development policy forbids (called from git hooks).',
	usage: 'guard <install [--runner=<path>] [--entry=<path>]|uninstall|status|pre-commit|reference-transaction|pre-push|post-checkout> [hook args]',
	async run(args, ctx): Promise<ICliCommandResult> {
		const [hook, ...hookArgs] = args;
		const manage = MANAGEMENT[hook ?? ''];
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
			// An unreadable configuration cannot be enforced; say so rather
			// than blocking every git operation in the repository.
			process.stderr.write(
				`delendai guard: the development policy could not be read (${error instanceof Error ? error.message : String(error)}); nothing was checked.\n`,
			);
			return { code: EXIT_CODE.OK };
		}
		if (policy === undefined) return { code: EXIT_CODE.OK };
		if (hook === 'post-checkout') {
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
		const operations = operationsForHook(
			hook as IGuardedHook,
			hookArgs,
			hook === 'pre-commit' ? '' : await facts.stdin(),
			{
				branch: facts.branch(),
				isMerge: facts.isMerge(),
				inMainWorktree: facts.inMainWorktree(),
			},
		);
		for (const operation of operations) {
			const verdict = judgeGitOperation(policy, operation);
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
