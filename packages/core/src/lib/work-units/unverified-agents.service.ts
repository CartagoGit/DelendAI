/**
 * unverified-agents.service.ts — the names at work that nothing confirms
 * name a model.
 *
 * An agent names itself, and the name was only normalised: on 2026-10-28
 * `delendai-m3-docs-20261028`, a task word and a date, became a work ref.
 * A model this machine was seen running, or one the project lists, is
 * confirmed; any other name is shown as unverified, beside its units, and
 * the project's identity policy decides what it may do.
 */
import { normalizeWorkAgentId } from '../work-identity/resolve-work-agent.service';

/** Each name at work no model seen here and no roster entry confirms. */
export const unverifiedAgents = (input: {
	/** The agents of the units at work and published now. */
	readonly agents: readonly string[];
	/** The models this machine was seen running. */
	readonly seen: readonly string[];
	/** The names the project lists, when it lists any. */
	readonly roster: readonly string[];
	/** This product's own actors sign `<namespace>-<words>`. */
	readonly namespacePrefix: string;
}): readonly { readonly agent: string; readonly why: string }[] => {
	const confirmed = new Set(
		[...input.seen, ...input.roster].map(normalizeWorkAgentId),
	);
	const ownActor = new RegExp(
		`^${input.namespacePrefix}-[a-z]+(-[a-z]+)*$`,
		'u',
	);
	return [...new Set(input.agents)]
		.filter((agent) => !confirmed.has(agent) && !ownActor.test(agent))
		.sort()
		.map((agent) => ({
			agent,
			why: 'no model this machine was seen running and no name the project lists: it names itself, and nothing confirms it',
		}));
};
