/**
 * convention.interface.ts — what a project already does, measured.
 */
import type { IDetectedConventionInput } from './policy.interface';

/** How often the project uses one value for a topic. */
export interface IConventionObservation {
	readonly value: string;
	readonly count: number;
}

/** A detected convention, with the sample it was measured on. */
export interface IDetectedConvention extends IDetectedConventionInput {
	/** Occurrences counted across every value. */
	readonly sample: number;
}
