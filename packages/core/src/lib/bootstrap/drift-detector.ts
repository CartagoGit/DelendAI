// drift-detector: the strategy interface + helpers for "what changed
// between two project analyses?".
//
// SOLID — Open/Closed. New concerns (a future `dependencies-changed`
// or `license-changed` detector) are added by writing a new
// `IDriftDetector` — the composer (`drift.ts`) never changes.
// SOLID — Dependency Inversion. The composer depends on this
// interface, not on concrete detector classes. Tests can swap a fake
// detector in to isolate the pipeline.

import type { IProjectAnalysis } from './analyze-project';
import type { IDriftChange } from './drift';

/** Stable, alphabetical compare for readonly string arrays. */
export const sameStrings = (
	a: readonly string[],
	b: readonly string[],
): boolean => {
	if (a.length !== b.length) return false;
	const sa = [...a].sort();
	const sb = [...b].sort();
	return sa.every((v, i) => v === sb[i]);
};

/** Compact set-diff format: `+added,-dropped` or `unchanged`. */
export const formatSetDiff = (
	a: readonly string[],
	b: readonly string[],
): string => {
	const setA = new Set(a);
	const setB = new Set(b);
	const added = [...setB].filter((x) => !setA.has(x));
	const dropped = [...setA].filter((x) => !setB.has(x));
	const parts: string[] = [];
	if (added.length > 0) parts.push(`+${added.join(',+')}`);
	if (dropped.length > 0) parts.push(`-${dropped.join(',-')}`);
	return parts.length === 0 ? 'unchanged' : parts.join(' ');
};

export interface IDriftDetectorContext {
	readonly current: IProjectAnalysis;
	readonly last: IProjectAnalysis;
}

/**
 * Pure: returns the changes this detector observed between `current`
 * and `last`. Empty array means "no change for this concern".
 *
 * Detectors MUST be pure: no I/O, no time-of-day reads, no random
 * state. Determinism is what makes the report reproducible.
 */
export interface IDriftDetector {
	/** A short id (used in logs / debug). */
	readonly id: string;
	detect(ctx: IDriftDetectorContext): readonly IDriftChange[];
}
