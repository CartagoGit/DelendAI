/**
 * group-helpers.ts — single import site for command-group authors
 * (f00046). Each `groups/<plugin>.ts` is a thin 1:1 delegation to the
 * matching MCP tools; this module re-exports the shared base helpers
 * from `lib/helpers/cli-command.helper.ts` plus the thin group-only
 * extensions (`positionalArg`, `listArg`, `numberArg`, `usage`) so every
 * group file keeps a single import statement.
 *
 * The shared base (`data`, `scalarArg`, `hasFlag`, `request`,
 * `isRecord`) lives in `lib/helpers/cli-command.helper.ts` so non-group
 * surfaces (`commands/registry.ts`, the legacy `git.ts`) reuse the same
 * code without importing across layers. (f00096 renamed this module from
 * the old `lib/cli-helpers.service.ts` to reflect its `helper` role.)
 *
 * SOLID:
 *   - Single source of truth: every helper has exactly one definition.
 *   - Open/closed: adding a new helper means adding it to
 *     `cli-command.helper.ts` and optionally re-exporting it here.
 *   - Interface segregation: each helper is a pure function with a
 *     minimal signature.
 */
import { execFileSync } from 'node:child_process';

import { readWorkspacePolicy } from '@delendai/core/cli';
import {
	compileWorkRefParser,
	resolveWorkAgentId,
} from '@delendai/core/public';

import type { ICliCommandResult } from '../../contracts/interfaces/cli-command.interface';
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
// `scalarArg` is imported as a value binding so the local
// `listArg` / `numberArg` definitions below can call it; the
// `export { … } from` re-exports the rest of the shared base in
// one statement (the re-export does NOT bring the symbols into
// scope for the body of this file, which is why we need the value
// import alongside it).
import { scalarArg } from '../../lib/helpers/cli-command.helper';

export {
	data,
	hasFlag,
	isRecord,
	request,
} from '../../lib/helpers/cli-command.helper';
// `scalarArg` is re-exported here so consumers get every base helper
// in a single import statement.
export { scalarArg };

/** First non-flag positional argument, or `undefined`. */
export const positionalArg = (args: readonly string[]): string | undefined =>
	args.find((arg) => !arg.startsWith('-'));

/** Parse a comma-separated `--name=a,b,c` flag into a string array. */
export const listArg = (
	args: readonly string[],
	name: string,
): readonly string[] | undefined => {
	const raw = scalarArg(args, name);
	if (raw === undefined) return undefined;
	return raw
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
};

/** Parse a `--name=N` flag into a finite number, or `undefined`. */
export const numberArg = (
	args: readonly string[],
	name: string,
): number | undefined => {
	const raw = scalarArg(args, name);
	if (raw === undefined) return undefined;
	const value = Number(raw);
	return Number.isFinite(value) ? value : undefined;
};

/** A USAGE-coded error result with a one-line usage string. */
export const usage = (line: string): ICliCommandResult => ({
	code: EXIT_CODE.USAGE,
	error: `usage: ${line}`,
});

/**
 * Who this invocation works as: an explicit `--agent`, then what the
 * environment declares (`DELENDAI_AGENT_ID`) — the same answer the work
 * commands and the tools give. `undefined` when nobody declared one; the
 * machine is never a guess.
 */
export const agentArg = (
	args: readonly string[],
	env: NodeJS.ProcessEnv = process.env,
): string | undefined => {
	const explicit = scalarArg(args, 'agent');
	const identity = resolveWorkAgentId({
		...(explicit === undefined ? {} : { model: explicit }),
		environment: env.DELENDAI_AGENT_ID,
	});
	return identity.source === 'none' ? undefined : identity.id;
};

/**
 * The agent a unit's ref names: the work-ref template carries an
 * `${agent}` segment, read back with core's own parser so the reading
 * cannot drift from the writing. `undefined` when the branch is not a
 * work ref, or the project declares none.
 */
export const agentOfWorkBranch = (
	template: string | undefined,
	branch: string,
): string | undefined => {
	if (template === undefined || template === '') return undefined;
	const identity = compileWorkRefParser(template, '')?.parse(
		`refs/heads/${branch}`,
	);
	return identity === undefined || identity.agent === ''
		? undefined
		: identity.agent;
};

const currentBranch = (cwd: string): string | undefined => {
	try {
		const branch = execFileSync(
			'git',
			['symbolic-ref', '--quiet', '--short', 'HEAD'],
			{ cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
		).trim();
		return branch === '' ? undefined : branch;
	} catch {
		return undefined;
	}
};

/** The agent named by the unit this working tree is on, if it is one. */
const agentOfCheckout = async (cwd: string): Promise<string | undefined> => {
	const branch = currentBranch(cwd);
	if (branch === undefined) return undefined;
	const policy = await readWorkspacePolicy(cwd).catch(() => undefined);
	return agentOfWorkBranch(policy?.branches.workRefTemplate, branch);
};

/**
 * `agentArg`, then the unit the call runs in: an agent working in its
 * unit's worktree has already said who it is in the ref's name, and the
 * CLI should not ask again. Explicit flag and environment still win.
 */
export const resolveAgent = async (
	args: readonly string[],
	cwd: string,
	env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> =>
	agentArg(args, env) ?? (await agentOfCheckout(cwd));
