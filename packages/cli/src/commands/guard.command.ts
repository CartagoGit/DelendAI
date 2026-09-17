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

import { judgeGitOperation } from '@delendai/core/cli';
import type { IGuardedGitOperation } from '@delendai/core/cli';
import { parseJsonc, resolveDevelopmentPolicy } from '@delendai/core/public';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import type {
	IGuardFacts,
	IGuardedHook,
} from '../contracts/interfaces/guard.interface';
import { isRecord } from '../lib/helpers/cli-command.helper';
import { readConfigText } from '../lib/config-file.service';

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
	facts: { readonly branch: string | undefined; readonly isMerge: boolean },
): IGuardedGitOperation[] => {
	if (hook === 'pre-commit') {
		return [
			{ kind: 'commit', branch: facts.branch, isMerge: facts.isMerge },
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

const readAllStdin = async (): Promise<string> => {
	if (process.stdin.isTTY === true) return '';
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(
			Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)),
		);
	}
	return Buffer.concat(chunks).toString('utf8');
};

const defaultFacts = (workspace: string): IGuardFacts => ({
	branch: () => {
		const name = git(workspace, ['symbolic-ref', '--short', '-q', 'HEAD']);
		return name === undefined || name === '' ? undefined : name;
	},
	isMerge: () =>
		git(workspace, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']) !==
		undefined,
	stdin: readAllStdin,
	policy: async (root) => {
		const text = await readConfigText(root);
		if (text === undefined) return undefined;
		const parsed = parseJsonc(text);
		if (parsed.errors.length > 0) {
			throw new Error(
				`delendai.config.json does not parse (${parsed.errors.length} error(s))`,
			);
		}
		const config = parsed.value;
		if (!isRecord(config) || !isRecord(config.development)) {
			return undefined;
		}
		return resolveDevelopmentPolicy({ development: config.development });
	},
});

const HOOKS: readonly IGuardedHook[] = [
	'pre-commit',
	'reference-transaction',
	'pre-push',
];

export const createGuardCommand = (
	factsFor: (workspace: string) => IGuardFacts = defaultFacts,
): ICliCommand => ({
	name: 'guard',
	summary:
		'Refuse the git operations the project development policy forbids (called from git hooks).',
	usage: 'guard <pre-commit|reference-transaction|pre-push> [hook args]',
	async run(args, ctx): Promise<ICliCommandResult> {
		const [hook, ...hookArgs] = args;
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
		const operations = operationsForHook(
			hook as IGuardedHook,
			hookArgs,
			hook === 'pre-commit' ? '' : await facts.stdin(),
			{ branch: facts.branch(), isMerge: facts.isMerge() },
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
