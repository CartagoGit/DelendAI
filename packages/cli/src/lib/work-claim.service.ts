/**
 * work-claim.service.ts — a unit of work changes hands by changing its
 * name.
 *
 * A work ref is named after who owns it. That is the whole point of the
 * naming scheme the policy's `branches.workRefTemplate` states
 * answers "who is doing this" without anyone having to ask.
 *
 * So a ref one agent abandoned and another picked up is a ref that is
 * lying. It happened here: codex left
 * `…/codex-astra-6/f00551-S0-g1/…` behind, somebody else finished the
 * work on it, and for as long as that lasted the swarm view reported
 * codex as the owner of work codex was not doing. Every question the
 * naming scheme exists to answer got the wrong answer.
 *
 * The rename is mechanical, so it must be done by the machine. "The
 * agent that takes it over should notice and rename it" is a rule that
 * depends on an LLM remembering — which is exactly the class of rule
 * this project keeps finding broken.
 *
 * ## Why the generation goes up
 *
 * `g{n}` is which attempt this is. A different hand on the same slice is
 * a different attempt: keeping `g1` would produce two refs that claim to
 * be the same generation by different agents, and the history would say
 * they were the same run. Bumping is the honest record, and it is what a
 * person does by hand when they do this correctly.
 *
 * ## Why nothing is force-moved
 *
 * The commit does not change. A claim is `update-ref` to the new name,
 * a proof that the new name resolves to the same object, and only then
 * the deletion of the old one. If the proof fails, the old ref is still
 * there and nothing is lost — the ordering is the safety.
 */
import { execFileSync } from 'node:child_process';

import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

import type {
	IWorkClaim,
	IWorkClaimRefusal,
} from '../contracts/interfaces/work-claim.interface';
import {
	parseWorkSubject,
	workRefShapeInWords,
} from './work-ref-shape.service';
import { identityOf, listWorkRefs } from './work-swarm.service';

export type {
	IWorkClaim,
	IWorkClaimRefusal,
} from '../contracts/interfaces/work-claim.interface';

const git = (cwd: string, args: readonly string[]): string =>
	execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();

const shortName = (value: string): string =>
	value.replace(/^refs\//u, '').replace(/^heads\//u, '');

/**
 * What claiming `ref` for `agent` would produce — or why it cannot.
 *
 * Pure: it reads names and decides. Nothing here touches git.
 */
export const planWorkClaim = (input: {
	readonly ref: string;
	readonly sha: string;
	readonly agent: string;
	readonly policy: IResolvedDevelopmentPolicy;
}): IWorkClaim | IWorkClaimRefusal => {
	const { ref, sha, agent, policy } = input;
	if (agent.length === 0) {
		return {
			ref,
			reason: 'no agent identity: pass --agent, or set DELENDAI_AGENT_ID. A ref has to be named after somebody.',
		};
	}
	const prefix = shortName(policy.branches.workRefPrefix);
	const logical = shortName(ref);
	if (!logical.startsWith(prefix)) {
		return {
			ref,
			reason: `not a work ref for this project: it does not start with \`${prefix}\`.`,
		};
	}
	const { agent: heldBy, subject } = identityOf(logical, policy);
	if (heldBy === agent) {
		return {
			ref,
			reason: `already yours: this ref is named after \`${agent}\`. Nothing to claim.`,
		};
	}
	const parts = parseWorkSubject(policy.branches.workRefTemplate, subject);
	if (parts === undefined) {
		return {
			ref,
			// A ref that does not follow the shape cannot be renamed into
			// the shape without guessing what its parts were, and a wrong
			// guess produces a ref that claims a slice it is not about.
			reason: `cannot read \`${subject}\` as \`${workRefShapeInWords(policy.branches.workRefTemplate)}\`, so there is no honest new name for it. Publish it under a correct name by hand.`,
		};
	}
	const generation = Number(parts.generation) + 1;
	return {
		from: logical,
		to: `${prefix}${agent}/${parts.proposal}-${parts.slice}-g${String(generation)}/${parts.topic}`,
		heldBy,
		claimedBy: agent,
		sha,
		generation,
	};
};

/** Every unit of work in this clone that is not named after `agent`. */
export const claimableWorkRefs = (input: {
	readonly root: string;
	readonly agent: string;
	readonly policy: IResolvedDevelopmentPolicy;
}): readonly IWorkClaim[] => {
	const claims: IWorkClaim[] = [];
	for (const [logical, sha] of listWorkRefs(input.root, input.policy)) {
		const planned = planWorkClaim({
			ref: logical,
			sha,
			agent: input.agent,
			policy: input.policy,
		});
		if ('to' in planned) claims.push(planned);
	}
	return claims;
};

/**
 * Do it: create the new name, prove it resolves to the same commit, and
 * only then remove the old one.
 *
 * The order is the safety. A failed proof leaves both names in place,
 * which is recoverable; deleting first and failing to create is not.
 */
export const applyWorkClaim = (
	root: string,
	claim: IWorkClaim,
): IWorkClaim | IWorkClaimRefusal => {
	const to = `refs/heads/${claim.to}`;
	const from = `refs/heads/${claim.from}`;
	try {
		git(root, ['update-ref', to, claim.sha]);
	} catch (error) {
		return {
			ref: claim.from,
			reason: `could not create ${claim.to}: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
	// `rev-parse` THROWS for a ref that resolves to nothing — including
	// a ref `update-ref` accepted while pointing it at an object this
	// repository does not have. An unguarded read here turned the
	// proof step into the thing it was proving against.
	let landed = '';
	try {
		landed = git(root, ['rev-parse', to]);
	} catch {
		landed = '';
	}
	if (landed !== claim.sha) {
		return {
			ref: claim.from,
			reason: `${claim.to} resolves to ${landed || 'nothing'}, not ${claim.sha}; the old ref was left alone.`,
		};
	}
	try {
		git(root, ['update-ref', '-d', from, claim.sha]);
	} catch (error) {
		return {
			ref: claim.from,
			// Both names now point at the work. That is untidy and it is
			// not a loss, so it is reported rather than repaired blindly.
			reason: `${claim.to} now holds the work, but ${claim.from} could not be removed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
	return claim;
};
