/**
 * swarm-roster.service.ts — the run knows who joined it.
 *
 * After a run of fourteen agents nobody could say what three of them had
 * done: they left no unit, no commit and no pull request, and the only
 * trace of the run was what the others produced. Another worked under a
 * name that was not its own. The swarm view listed units, so an agent with
 * no unit was not in it at all.
 *
 * Every agent that enters a unit leaves a lease, whether or not it ever
 * commits. The roster is read from the leases and from the refs: who
 * joined, as how many instances, and what each produced. One that joined
 * and produced nothing is in the list, and says so.
 */
import type { ISwarmAgent } from '../contracts/interfaces/swarm-roster.interface';
import type { ISwarmView } from '../contracts/interfaces/work-swarm.interface';
import type { IUnitStandingEntry } from './unit-lease.interface';

/** The roster of a run, most productive first, then by name. */
export const rosterOf = (
	view: ISwarmView,
	standings: readonly IUnitStandingEntry[],
): readonly ISwarmAgent[] => {
	const agents = new Set<string>([
		...view.units.map((unit) => unit.agent),
		...view.published.map((unit) => unit.agent),
		...standings.flatMap((entry) =>
			entry.owner === null ? [] : [entry.owner.agent],
		),
	]);
	return [...agents]
		.filter((agent) => agent.length > 0)
		.map((agent): ISwarmAgent => {
			const units = view.units.filter((unit) => unit.agent === agent);
			const published = view.published.filter(
				(unit) => unit.agent === agent && unit.ahead > 0,
			);
			const sessions = new Set(
				standings
					.filter((entry) => entry.owner?.agent === agent)
					.map((entry) => entry.owner?.session ?? ''),
			);
			// A publication carries its unit's commits again: count the
			// larger of the two, not their sum.
			const commits = Math.max(
				units.reduce((sum, unit) => sum + unit.ahead, 0),
				published.reduce((sum, unit) => sum + unit.ahead, 0),
			);
			return {
				agent,
				instances: Math.max(sessions.size, 1),
				units: units.length,
				commits,
				published: published.length,
				producedNothing: commits === 0,
			};
		})
		.sort(
			(left, right) =>
				right.commits - left.commits ||
				left.agent.localeCompare(right.agent),
		);
};

/** The roster as a person reads it, one agent per line. */
export const describeRoster = (
	roster: readonly ISwarmAgent[],
): readonly string[] =>
	roster.length === 0
		? []
		: [
				'',
				`agents in this run (${String(roster.length)}):`,
				...roster.map(
					(each) =>
						`  ${each.agent}  ${String(each.instances)} instance(s), ${String(each.units)} unit(s), ${String(each.commits)} commit(s), ${String(each.published)} waiting to land${each.producedNothing ? ' — joined and produced nothing' : ''}`,
				),
			];
