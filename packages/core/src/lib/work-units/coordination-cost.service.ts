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
import { readGit } from './work-unit-shared.service';

/** A commit that coordinates rather than delivers, by its subject. */
const BOOKKEEPING = /^chore\((?:generated|delendai|review)\)[:!]/u;

/** The cost of the commits listed one per line as `<parents>\t<subject>`. */
export const coordinationCostOf = (
	log: string,
	windowDays: number,
): ICoordinationCost => {
	let commits = 0;
	let merges = 0;
	let bookkeeping = 0;
	for (const line of log.split('\n')) {
		if (line.length === 0) continue;
		const [parents = '', subject = ''] = line.split('\t');
		commits += 1;
		if (parents.trim().split(' ').length > 1) merges += 1;
		else if (BOOKKEEPING.test(subject)) bookkeeping += 1;
	}
	return {
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
): ICoordinationCost | undefined => {
	const log = readGit(root, [
		'log',
		`--since=${String(windowDays)} days ago`,
		'--format=%P%x09%s',
		integration,
	]);
	return log === undefined ? undefined : coordinationCostOf(log, windowDays);
};
