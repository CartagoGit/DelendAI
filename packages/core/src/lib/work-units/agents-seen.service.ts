/**
 * agents-seen.service.ts — every name that signed work in this project,
 * oldest first.
 *
 * The agents at work now are in the refs; the ones whose work landed are
 * in the integration branch's merges, which name the publication each
 * came from. Together they are what the project knows of who works in
 * it, without anyone having written a list.
 */
import { describeAgentNameShape } from './agent-name-canon.service';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { isWorkKind } from '../development-policy/work-ref-placeholders';
import {
	aliasedIdentity,
	describeAlias,
	describeFirstSpelling,
	describeOffRoster,
	firstSpelling,
} from './agent-alias.service';
import { readGit } from './work-unit-shared.service';

/** How far back the integration branch's merges are read. */
const MERGES_READ = 3000;

const bare = (prefix: string): string =>
	prefix.replace(/^(refs\/)?(heads\/)?/u, '');

/** The agents of the publications `subjects` name, in the order given. */
export const agentsOfMerges = (
	subjects: readonly string[],
	publicationPrefix: string,
): readonly string[] => {
	const prefix = bare(publicationPrefix);
	if (prefix.length === 0) return [];
	const named = subjects.flatMap((subject) => {
		const at = subject.indexOf(prefix);
		if (at === -1) return [];
		// `<agent>/<kind>/…`: a publication named before units had a kind
		// begins with its topic, which is nobody's name.
		const [agent = '', kind = ''] = subject
			.slice(at + prefix.length)
			.split('/');
		return agent.length > 0 && isWorkKind(kind) ? [agent] : [];
	});
	return [...new Set(named)];
};

/** Every agent that signed work here: landed first (oldest first), then live. */
export const agentsSeen = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly live: readonly string[];
}): readonly string[] => {
	const { root, policy } = input;
	const integration = policy.branches.integration;
	const tip =
		readGit(root, [
			'rev-parse',
			'-q',
			'--verify',
			`refs/remotes/origin/${integration}`,
		]) === undefined
			? integration
			: `refs/remotes/origin/${integration}`;
	const merges = (
		readGit(root, [
			'log',
			'--first-parent',
			'--merges',
			'--reverse',
			`--max-count=${String(MERGES_READ)}`,
			'--format=%s',
			tip,
		]) ?? ''
	).split('\n');
	return [
		...new Set([
			...agentsOfMerges(merges, policy.branches.publicationRefPrefix),
			...input.live,
		]),
	];
};

/**
 * Why `agent` may not sign work here under that name, and what to do; or
 * `undefined`. The agent names itself. The project holds it to the names
 * it lists, when it lists any, and holds a model to the name it first
 * signed with, among the agents at work and those whose work landed.
 */
export const entrantNameRefusal = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly agent: string;
	/** The agents of the units at work and published now. */
	readonly live: readonly string[];
}): { readonly what: string; readonly how: string } | undefined => {
	const { agent, policy } = input;
	const roster = policy.coordination.roster ?? [];
	const offRoster = describeOffRoster(agent, roster);
	if (offRoster !== undefined) {
		return { what: 'This project names who works in it.', how: offRoster };
	}
	// A re-spelling of a name already at work is pointed at that name,
	// before anything is said about how names are written.
	const seen = agentsSeen(input);
	const respelled = aliasedIdentity(agent, seen);
	if (respelled !== undefined) {
		return {
			what: 'An identity is spelled one way.',
			how: describeAlias(agent, respelled),
		};
	}
	const shape = describeAgentNameShape(
		agent,
		policy.branches.namespacePrefix,
	);
	if (shape !== undefined) {
		return { what: 'An agent names itself in one shape.', how: shape };
	}
	const first = firstSpelling(agent, seen, roster);
	return first === undefined
		? undefined
		: {
				what: 'A model signs under one name.',
				how: describeFirstSpelling(agent, first),
			};
};
