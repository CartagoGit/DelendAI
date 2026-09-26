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
import { join, resolve } from 'node:path';

import { sharedCheckout } from '../shared/shared-checkout';
import { agentEnvironmentMarker } from '../work-identity/agent-environment.helper';

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

/**
 * Why a tool must not write into `root`, or `undefined` when it may.
 *
 * Under a policy whose work reaches the integration branch through work
 * refs, the shared checkout sitting on the integration branch belongs to
 * nobody's unit of work: nothing commits there, and nothing carries a
 * change made there to a work ref. A proposal handed to review, a
 * reviewer's verdict, an ingested issue - each landed there as a loose
 * change that looked done to the agent that made it, held the checkout
 * back from being brought level, and was eventually lost. Measured on
 * 2026-09-25: seven finished proposals never left `in-progress` that
 * way, and a reviewer's verdicts sat uncommitted on the integration
 * branch.
 *
 * A worktree is always allowed (that is where a unit of work lives), so is
 * a CI job's checkout (a throwaway copy nobody shares, and no agent
 * drives), and so is a
 * project with no work-ref model, whose work reaches the
 * integration branch directly by its own route.
 */
export const integrationCheckoutRefusal = async (
	root: string,
	env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<string | undefined> => {
	// A CI job's checkout is a throwaway copy, not the checkout agents
	// share: nothing there is expected to be committed, and a write there
	// loses nobody's work. CI checks out the integration branch by name on
	// a push to it, so without this the gate refused the runtime's own
	// verification of every caller-checkout tool, and the integration
	// branch's certification went red.
	//
	// `CI=true` alone does not make a CI job: agent runtimes export it to
	// switch off interactive prompts, and an agent driving the shared
	// checkout with it set would pass. A process an agent drives is never
	// the throwaway copy, whatever else its environment says.
	if (env.CI === 'true' && agentEnvironmentMarker(env) === undefined) {
		return undefined;
	}
	const development = await declaredDevelopment(root);
	if (development === undefined) return undefined;
	const policy = resolveDevelopmentPolicy({ development });
	if (policy.branches.workRefTemplate.length === 0) return undefined;
	const shared = sharedCheckout(root);
	if (shared === undefined || resolve(shared) !== resolve(root)) {
		return undefined;
	}
	const branch = checkedOutBranch(root);
	if (branch !== policy.branches.integration) return undefined;
	return `this call would write into the shared checkout on ${branch}, the integration branch. Under this project's policy work reaches ${branch} only through a work ref and a pull request, so a change written here is committed by nobody and is lost.`;
};
