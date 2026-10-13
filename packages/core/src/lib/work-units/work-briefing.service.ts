/**
 * work-briefing.service.ts — the picture reaches the agent that needs
 * it.
 *
 * `work swarm` has answered "what is everyone else doing" since x00555
 * S1, and `work checkpoint` now refuses a scope somebody else is already
 * in. Both leave the same hole: the first is a command an agent has to
 * think of running, and the second only speaks once the work exists.
 * Between them sits the moment that actually decides the collision —
 * `work enter`, where an agent is handed a worktree and chooses what to
 * touch.
 *
 * So `enter` states the picture unasked. Not as a warning (there is
 * nothing wrong yet, and an agent that is warned about nothing learns to
 * skip the warnings) but as the briefing the decision needs: who else is
 * live, on what, and which paths are already contested.
 */
import type {
	IBriefedUnit,
	IWorkBriefing,
} from '../contracts/interfaces/work-briefing.interface';
import type {
	ISwarmUnit,
	ISwarmView,
} from '../contracts/interfaces/work-swarm.interface';

export type {
	IBriefedUnit,
	IWorkBriefing,
} from '../contracts/interfaces/work-briefing.interface';

/**
 * The swarm as it matters to one identity that is about to start.
 *
 * Pure over a view `readSwarm` already produces: the briefing decides
 * what is worth saying, not how to look it up.
 */
export const briefingFrom = (input: {
	readonly view: ISwarmView;
	readonly agent: string;
}): IWorkBriefing => {
	const briefed =
		(published: boolean) =>
		(unit: ISwarmUnit): IBriefedUnit => ({
			agent: unit.agent,
			ref: unit.ref,
			subject: unit.subject,
			paths: unit.paths,
			published,
		});
	// Your own units are not news to you. Somebody else's publication that
	// has not landed is: an agent entering saw only work refs, so a pull
	// request about to change its files went unmentioned.
	const theirs = (unit: ISwarmUnit): boolean => unit.agent !== input.agent;
	const others: IBriefedUnit[] = [
		...input.view.units.filter(theirs).map(briefed(false)),
		...input.view.published
			.filter((unit) => theirs(unit) && unit.ahead > 0)
			.map(briefed(true)),
	];
	return {
		others,
		contested: input.view.overlaps.map((overlap) => overlap.path),
	};
};

/**
 * The briefing in words.
 *
 * It says "nobody else" out loud rather than printing nothing: silence
 * is indistinguishable from a briefing that failed to run, and an agent
 * that cannot tell the difference has to go and check anyway.
 */
export const describeBriefing = (
	briefing: IWorkBriefing,
): readonly string[] => [
	briefing.others.length === 0
		? 'swarm            nobody else holds a unit of work right now'
		: `swarm            ${String(briefing.others.length)} other unit(s) of work are live or waiting to land:`,
	...briefing.others.map(
		(unit) =>
			`  ${unit.agent}  ${unit.subject}  ${String(unit.paths.length)} path(s)${unit.published ? '  (published, waiting to land)' : ''}  ${unit.ref}`,
	),
	...(briefing.contested.length === 0
		? []
		: [
				`contested        ${String(briefing.contested.length)} path(s) more than one unit is already changing:`,
				...briefing.contested.map((path) => `  ${path}`),
			]),
];
