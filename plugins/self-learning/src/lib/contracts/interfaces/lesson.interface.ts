/**
 * Contracts for the lessons a project's own history supports.
 *
 * A lesson is a claim about THIS project, derived from observations the
 * runtime already recorded — never a generalisation, never advice from
 * elsewhere. It carries the evidence that produced it and a confidence
 * that can go down, because a project changes and a lesson that was
 * true in July is a liability in September.
 */

import type { IObservation, IObservationKind } from './observation.interface';

/** What a lesson is about. Mirrors the observation kinds it derives from. */
export type ILessonKind =
	/** "this command usually works / usually fails here". */
	| 'command-reliability'
	/** "this spec fails more than the rest". */
	| 'fragile-test'
	/** "this refusal keeps happening". */
	| 'recurring-refusal';

/**
 * How much weight a lesson carries.
 *
 * Three inputs, all countable: how many observations support it, how
 * recent they are, and how many contradict it. Nothing here is a model
 * output — the proposal's non-goal is explicit that this stays
 * statistics over the project's own events.
 */
export interface ILessonConfidence {
	/** Observations that support the claim. */
	readonly support: number;
	/** Observations of the same subject that contradict it. */
	readonly counterExamples: number;
	/** Support that arrived within the recency window. */
	readonly recentSupport: number;
	/** 0..1. Rounded to two places so a report is readable. */
	readonly score: number;
	/** `high` ≥ 0.7, `medium` ≥ 0.4, else `low`. */
	readonly band: 'high' | 'medium' | 'low';
}

export interface ILesson {
	readonly kind: ILessonKind;
	/** What the lesson is about: a command line, a test name, a code. */
	readonly subject: string;
	/** One sentence, safe to show verbatim. */
	readonly claim: string;
	readonly confidence: ILessonConfidence;
	/** When the newest supporting observation happened. */
	readonly lastSeenMs: number;
	/** The observations behind it, newest first, capped. */
	readonly evidence: readonly IObservation[];
}

export interface IDeriveLessonsOptions {
	/**
	 * Observations older than this are not counted as recent. Default 14
	 * days: long enough to survive a quiet week, short enough that a
	 * lesson about a command nobody has run since June expires.
	 */
	readonly recencyWindowMs?: number;
	/**
	 * Minimum supporting observations before a pattern is a lesson at
	 * all. Default 3 — two is a coincidence, and a store that turns
	 * every coincidence into advice is worse than no store.
	 */
	readonly minimumSupport?: number;
	/** Evidence entries kept per lesson. Default 5. */
	readonly maxEvidence?: number;
	/** `now`, injected so a derivation is reproducible. */
	readonly nowMs?: number;
}

/** What `self_learning_advice` answers for a stated goal. */
export interface IAdvice {
	readonly subject: string;
	readonly recommendation: string;
	readonly confidence: ILessonConfidence;
	readonly kind: ILessonKind;
}

export interface IObservationsByKind {
	readonly kind: IObservationKind;
	readonly observations: readonly IObservation[];
}
