/**
 * The one statement of how agents are isolated, derived from the policy.
 *
 * Guidance used to be hardcoded, and it contradicted the policy: an
 * adopter project on `shared-checkout-merge` was told that 2+ agents
 * "must call agent_worktree", had that call refused with an invitation to
 * enable worktrees, and its agent then created worktrees and `agent/*`
 * branches by hand. Every place that tells an agent how to isolate its
 * work reads this instead, so the advice cannot disagree with the policy
 * it runs under.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IWorkIsolation } from '../contracts/interfaces/work-isolation.interface';

const HOST_DISABLED_REFUSAL =
	'agent_worktree is disabled by host configuration. Pass --agent-worktree=true (CLI) or set agentWorktree: true in delendai.config.json to enable.';

const displayPrefix = (prefix: string): string =>
	prefix.replace(/^refs\//u, '').replace(/^heads\//u, '');

export const describeWorkIsolation = (
	policy: IResolvedDevelopmentPolicy | undefined,
): IWorkIsolation => {
	if (policy === undefined) {
		return {
			agentWorktrees: true,
			rule: '2+ agents sharing this repo? Each must call agent_worktree (action: create) once at the start of its session — it isolates the agent into its own git worktree + branch (agent/<name>) so concurrent git add/commit never race on a shared .git/index. List active worktrees with action: list; clean up with action: remove.',
			worktreeRefusal: HOST_DISABLED_REFUSAL,
		};
	}
	if (policy.workspace.agentWorktrees) {
		return {
			agentWorktrees: true,
			rule: `This project uses the \`${policy.profile}\` development profile: each agent works in its own git worktree. Call agent_worktree (action: create) once at the start of the session and work only inside it; list with action: list, clean up with action: remove.`,
			worktreeRefusal: HOST_DISABLED_REFUSAL,
		};
	}
	const persistence = policy.persistence.usesWipRefs
		? `delendai checkpoints each finished slice to a work ref under \`${displayPrefix(policy.branches.workRefPrefix)}\` and removes it once its work is integrated`
		: `finished slices are committed to \`${policy.branches.integration}\``;
	// With work refs, a unit of work lives in the worktree `delendai work
	// enter` makes for it, and delendai's writes are refused in the shared
	// checkout on the integration branch. Telling an agent "do not create
	// worktrees" without naming that command sent it to write where
	// nothing commits; what is forbidden is making them by hand.
	const route = policy.persistence.usesWipRefs
		? ` Start each unit of work with \`delendai work enter --proposal=<id> --slice=<slice> --agent=<you>\`: it creates the unit's worktree and work ref. Work there, pass that worktree as \`checkout\` to delendai's tools, and finish with \`delendai work publish\`.`
		: '';
	const rule = `This project uses the \`${policy.profile}\` development profile: the shared checkout stays on \`${policy.branches.integration}\`. Do not create worktrees or branches by hand (no \`git worktree add\`, \`git switch\`, \`git checkout -b\`), and do not call agent_worktree.${route} Claim the files you edit with agent_lock so agents never touch the same file; ${persistence}.`;
	return {
		agentWorktrees: false,
		rule,
		worktreeRefusal: `agent_worktree is not used under the \`${policy.profile}\` development profile. ${rule}`,
	};
};
