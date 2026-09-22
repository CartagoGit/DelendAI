/**
 * project-branches.ts — the integration branch is whatever the project
 * says it is.
 *
 * Callers used to end their resolution chain in a literal:
 * `args.baseBranch ?? options.defaultBaseBranch ?? 'develop'`, and
 * `?? 'agent/'` for the work-ref prefix. Both are facts about ONE
 * repository. A project whose integration branch is `main`, `trunk` or a
 * release line got a default naming a branch that does not exist — and
 * the branch garbage collector is one of the callers, so the guess had
 * teeth.
 *
 * The development policy already answers both questions, and it is the
 * single place that should. This reads it, so the last resort is the
 * project's own configuration rather than this repository's habits.
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveDevelopmentPolicy } from './resolve';

/** The project's declared development block, or nothing. */
const declaredDevelopment = async (
	workspaceRoot: string,
): Promise<Record<string, unknown> | undefined> => {
	try {
		const parsed = JSON.parse(
			await readFile(join(workspaceRoot, 'delendai.config.json'), 'utf8'),
		) as Record<string, unknown>;
		const development = parsed.development;
		return development === null || typeof development !== 'object'
			? undefined
			: (development as Record<string, unknown>);
	} catch {
		return undefined;
	}
};

/**
 * The branch checked out in this working tree, or nothing when HEAD is
 * detached or git cannot answer.
 *
 * Not to be confused with the wip-engine's own probe in
 * `wip-engine/anchor.ts`: that one runs through an injected `IGitRunner`
 * (so a dry run never shells out) and distinguishes "not a repository"
 * from "detached HEAD", because an anchor verdict means something
 * different in each case. This one is the plain question a caller asks
 * when it just needs the name, and it is the ONLY implementation of that
 * question — `work.command.ts` had a private copy of it.
 */
export const checkedOutBranch = (workspaceRoot: string): string | undefined => {
	try {
		const branch = execFileSync(
			'git',
			['symbolic-ref', '--short', 'HEAD'],
			{
				cwd: workspaceRoot,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
			},
		).trim();
		return branch.length === 0 ? undefined : branch;
	} catch {
		return undefined;
	}
};

/**
 * What this project calls its integration branch and its work refs.
 *
 * When the project declares `branches.integration`, that is the answer.
 * When it does not, the answer is the branch the workspace is ON — not a
 * literal. Work started from a release line belongs to that release
 * line, and a project whose trunk is `main` never has to say so twice.
 * `develop` is this repository's habit, and habits are not defaults.
 */
export const projectBranches = async (
	workspaceRoot: string,
): Promise<{
	readonly integration: string;
	readonly workRefPrefix: string;
}> => {
	const development = await declaredDevelopment(workspaceRoot);
	const declaredIntegration = (
		development?.branches as { integration?: unknown } | undefined
	)?.integration;
	const policy = resolveDevelopmentPolicy(
		development === undefined ? {} : { development },
	);
	const prefix = policy.branches.workRefPrefix
		.replace(/^refs\//u, '')
		.replace(/^heads\//u, '');
	const integration =
		typeof declaredIntegration === 'string' &&
		declaredIntegration.length > 0
			? declaredIntegration
			: // The branch the workspace is on — the CONSERVATIVE answer,
				// and the right one for this function's callers.
				//
				// The branch reaper is one of them: it needs to know which
				// branch must never be deleted, and "the one somebody is
				// standing on" is exactly that.
				//
				// It is NOT the right answer for the development policy's
				// integration branch, which has to be stable: defining it
				// as wherever the checkout currently is makes every check
				// depending on it vacuous. `defaultBranchOf` answers that
				// other question, and `readWorkspacePolicy` asks it.
				(checkedOutBranch(workspaceRoot) ??
				policy.branches.integration);
	return { integration, workRefPrefix: prefix };
};
