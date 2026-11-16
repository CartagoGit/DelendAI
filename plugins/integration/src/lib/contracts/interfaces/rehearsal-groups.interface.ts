/**
 * The shapes of the groups a mode's catalogue is cut into, and of the
 * reports that come back from them.
 */
import type {
	IRehearsalReport,
	IRehearsalScenario,
} from './rehearsal.interface';

/** A group named by its place: `n/total`, both from 1. */
export interface IGroupSpec {
	readonly n: number;
	readonly total: number;
}

/** One group as the workflow planned it: its place and the scenarios it was to play. */
export interface IGroupPlan {
	readonly n: number;
	readonly total: number;
	readonly scenarios: readonly IRehearsalScenario[];
}

/** The report of a group, or why there is none. */
export type IGroupReport =
	| { readonly report: IRehearsalReport }
	| { readonly missing: string };
