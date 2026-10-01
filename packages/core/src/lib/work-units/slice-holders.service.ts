/**
 * slice-holders.service.ts — one slice, one agent at a time.
 *
 * `work enter` already refused a second session of the SAME agent on a
 * slice. A different agent was never asked: on 2026-10-01 two
 * orchestrators each sent subagents into the same proposals, a slice was
 * published under three generations at once, and each unit spent CI and
 * merges on work another was already doing. The swarm knew; nothing
 * consulted it on the way in.
 *
 * A slice is held by a live work ref or by a publication that has not
 * landed. A unit for `all` holds every slice of its proposal, and a slice
 * holds `all`. Review units read other units' work instead of doing it,
 * so they neither hold a slice nor are kept out of one.
 */
import type {
	ISwarmUnit,
	ISwarmView,
} from '../contracts/interfaces/work-swarm.interface';
import { unitKeyOf } from './work-swarm.service';

/** Unit kinds that read work rather than do it. */
const READING_KINDS: ReadonlySet<string> = new Set(['review']);

/** The slice that holds every other slice of its proposal. */
const WHOLE_PROPOSAL = 'all';

const sliceOf = (
	subject: string,
):
	| {
			readonly kind: string;
			readonly proposal: string;
			readonly slice: string;
	  }
	| undefined => {
	const key = unitKeyOf(subject);
	if (key === undefined) return undefined;
	// Proposal ids carry no dash; the slice is everything after the first.
	const dash = key.slice.indexOf('-');
	if (dash <= 0) return undefined;
	return {
		kind: subject.split('/')[0] ?? '',
		proposal: key.slice.slice(0, dash),
		slice: key.slice.slice(dash + 1),
	};
};

const covers = (left: string, right: string): boolean =>
	left === right || left === WHOLE_PROPOSAL || right === WHOLE_PROPOSAL;

/**
 * The units of OTHER agents already on this slice, and none when this
 * agent holds the slice itself: re-entering your own unit is how you
 * finish it, and refusing that would strand the work.
 */
export const holdersOfSlice = (input: {
	readonly view: ISwarmView;
	readonly agent: string;
	readonly kind: string;
	readonly proposal: string;
	readonly slice: string;
}): readonly ISwarmUnit[] => {
	if (READING_KINDS.has(input.kind)) return [];
	const live = [
		...input.view.units,
		...input.view.published.filter((unit) => unit.ahead > 0),
	];
	const onSlice = live.filter((unit) => {
		const held = sliceOf(unit.subject);
		return (
			held !== undefined &&
			!READING_KINDS.has(held.kind) &&
			held.proposal === input.proposal &&
			covers(held.slice, input.slice)
		);
	});
	if (onSlice.some((unit) => unit.agent === input.agent)) return [];
	return onSlice;
};

/** What to tell an agent whose slice is already somebody else's. */
export const describeSliceHolders = (
	holders: readonly ISwarmUnit[],
): readonly string[] => [
	...holders.map(
		(unit) =>
			`  ${unit.agent} holds it in ${unit.ref} (+${String(unit.ahead)} commit(s))`,
	),
	'',
	'Answers, and only these:',
	'  wait        — let them land it; their ref disappears when it merges.',
	'  other work  — take a slice nobody holds.',
	'  take it     — `delendai work claim --ref=<their ref>` renames it to you',
	'                and leaves a record that it changed hands.',
	'  alongside   — pass --alongside for a deliberate second attempt beside',
	'                theirs, knowing one of the two will be thrown away.',
];
