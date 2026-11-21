/**
 * coordination-cost.service.ts — what a swarm spends coordinating, as a
 * share of what lands.
 *
 * Commit throughput looked like progress while most of it was not work:
 * merges, regenerated views and the tools' own bookkeeping (claims,
 * verdict records, transitions). The share of those among everything the
 * integration branch took in is the number a swarm should drive down.
 */
import type { ICoordinationCost } from '../contracts/interfaces/workflow-kpis.interface';
import { unitOfName } from '../development-policy/owned-work-ref-parser';
import { readGit } from './work-unit-shared.service';

/** A commit that coordinates rather than delivers, by its subject. */
const BOOKKEEPING = /^chore\((?:generated|delendai|review)\)[:!]/u;

/**
 * The publication a merge commit's subject names, whatever the forge's
 * wording around it: the ref is found by its prefix, and its first
 * segment after the prefix is the agent that published it.
 */
const publicationIn = (
	subject: string,
	prefixes: readonly string[],
): { readonly ref: string; readonly agent: string } | undefined => {
	// Longest first, so `delendai/pr/` is not read as `pr/` inside it.
	const prefix = [...prefixes]
		.filter((each) => each.length > 0 && subject.includes(each))
		.sort((a, b) => b.length - a.length)[0];
	if (prefix === undefined) return undefined;
	const at = subject.indexOf(prefix);
	const ref = /^[^\s'"]+/u.exec(subject.slice(at))?.[0] ?? '';
	const agent =
		unitOfName(ref.slice(prefix.length))?.agent ??
		ref.slice(prefix.length).split('/')[0] ??
		'';
	return agent.length === 0 ? undefined : { ref, agent };
};

/** The cost of the commits listed one per line as `<parents>\t<subject>`. */
export const coordinationCostOf = (
	log: string,
	windowDays: number,
	publicationRefPrefix: string | readonly string[] = '',
): ICoordinationCost => {
	const prefixes = [publicationRefPrefix].flat();
	let commits = 0;
	let merges = 0;
	let bookkeeping = 0;
	const units = new Set<string>();
	const agents = new Set<string>();
	for (const line of log.split('\n')) {
		if (line.length === 0) continue;
		const [parents = '', subject = ''] = line.split('\t');
		commits += 1;
		if (parents.trim().split(' ').length > 1) {
			merges += 1;
			const landed = publicationIn(subject, prefixes);
			if (landed !== undefined) {
				units.add(landed.ref);
				agents.add(landed.agent);
			}
		} else if (BOOKKEEPING.test(subject)) bookkeeping += 1;
	}
	return {
		...(prefixes.every((prefix) => prefix.length === 0)
			? {}
			: { landed: { units: units.size, agents: agents.size } }),
		windowDays,
		commits,
		merges,
		bookkeeping,
		tax:
			commits === 0
				? 0
				: Math.round(((merges + bookkeeping) / commits) * 1000) / 1000,
	};
};

/** The cost over the last `windowDays` of `integration`, read from git. */
export const readCoordinationCost = (
	root: string,
	integration: string,
	windowDays: number,
	publicationRefPrefix: string | readonly string[] = '',
): ICoordinationCost | undefined => {
	const log = readGit(root, [
		'log',
		`--since=${String(windowDays)} days ago`,
		'--format=%P%x09%s',
		integration,
	]);
	return log === undefined
		? undefined
		: coordinationCostOf(log, windowDays, publicationRefPrefix);
};
