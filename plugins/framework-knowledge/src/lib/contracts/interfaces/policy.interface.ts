/**
 * policy.interface.ts — the pure contract for resolving
 * project policy against a framework's own force on a topic.
 *
 * The caller already knows, for one topic (e.g. `component-styles`),
 * every option the installed framework version supports and each
 * option's `IKnowledgeForce`. This resolves which option WINS,
 * from an ordered set of inputs, and whether the answer is a clean
 * pick or a contradiction the caller asked for anyway.
 */
import type { IKnowledgeForce } from './knowledge-record.interface';

/** One candidate value for a topic, and what the installed version says about it. */
export interface IPolicyOption {
	readonly value: string;
	readonly force: IKnowledgeForce;
}

/** Where a resolved value came from, ordered strongest to weakest. */
export type IPolicySource =
	| 'technical-impossibility'
	| 'user'
	| 'project'
	| 'detected-convention'
	| 'framework-recommendation'
	| 'default';

export interface IDetectedConventionInput {
	readonly value: string;
	/** 0..1, measured from what the project already does. */
	readonly confidence: number;
}

export interface IPolicyInputs {
	/**
	 * Every option this topic has, and its force at the resolved
	 * framework version. A value with no matching entry is treated as
	 * `supported`: the absence of a rule is not itself a prohibition.
	 */
	readonly options: readonly IPolicyOption[];
	/**
	 * A fact independent of framework force — e.g. the project's tooling
	 * cannot execute the option at all. Checked FIRST: it overrides
	 * every other input, including an explicit user preference.
	 */
	readonly technicalImpossibility?: { readonly reason: string } | undefined;
	/** Explicit user configuration (`delendai.config.json` user scope). */
	readonly userPreference?: string | undefined;
	/** Explicit project configuration (checked into the repo). */
	readonly projectPreference?: string | undefined;
	/** What the project already does, measured. */
	readonly detectedConvention?: IDetectedConventionInput | undefined;
	/** The value among `options` whose force is `required` or `recommended`. */
	readonly frameworkRecommendation?: string | undefined;
	/** delendai's own fallback when nothing else answers. */
	readonly defaultValue: string;
}

/** A clean pick: the value is allowed at the resolved framework version. */
export interface IPolicyResolved {
	readonly outcome: 'resolved';
	readonly value: string;
	readonly source: IPolicySource;
	readonly force: IKnowledgeForce;
}

/**
 * The highest-priority source asked for a value the resolved version
 * refuses (`removed`), or a caller-declared technical impossibility.
 * A lower-priority source is never silently substituted — the caller
 * asked for something specific, and that contradiction is the answer.
 */
export interface IPolicyIncompatible {
	readonly outcome: 'incompatible';
	readonly value: string;
	readonly source: IPolicySource;
	readonly reason: string;
}

export type IPolicyResolution = IPolicyResolved | IPolicyIncompatible;
