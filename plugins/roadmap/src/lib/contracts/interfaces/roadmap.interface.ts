import type {
	ROADMAP_BUMP_HINTS,
	ROADMAP_ENTRY_KINDS,
	ROADMAP_ENTRY_STATES,
	ROADMAP_ESTIMATE_CONFIDENCES,
	ROADMAP_GATE_KINDS,
} from '../constants/roadmap.constant';

export type IRoadmapEntryKind = (typeof ROADMAP_ENTRY_KINDS)[number];
export type IRoadmapEntryState = (typeof ROADMAP_ENTRY_STATES)[number];
export type IRoadmapGateKind = (typeof ROADMAP_GATE_KINDS)[number];
export type IRoadmapBumpHint = (typeof ROADMAP_BUMP_HINTS)[number];
export type IRoadmapEstimateConfidence =
	(typeof ROADMAP_ESTIMATE_CONFIDENCES)[number];

/** A condition that decides whether an entry has been delivered. */
export interface IRoadmapGate {
	readonly kind: IRoadmapGateKind;
	/** What the condition names: a proposal id, a path or a check name. */
	readonly target?: string | undefined;
	readonly description?: string | undefined;
}

/**
 * A date the author believes in. It always says where it comes from and
 * how sure it is, and it never takes part in readiness: a date nobody can
 * audit is a hope, not a deadline.
 */
export interface IRoadmapEstimate {
	readonly date: string;
	readonly basis: string;
	readonly confidence: IRoadmapEstimateConfidence;
}

export interface IRoadmapEntry {
	readonly id: string;
	readonly title: string;
	readonly kind: IRoadmapEntryKind;
	readonly state: IRoadmapEntryState;
	readonly gates: readonly IRoadmapGate[];
	readonly estimate?: IRoadmapEstimate | undefined;
	/** Proposal ids the entry is tracked by. */
	readonly proposals?: readonly string[] | undefined;
	/** The entry that replaced this one; set only when it is `superseded`. */
	readonly supersededBy?: string | undefined;
	readonly note?: string | undefined;
}

/** What one target version promises. */
export interface IRoadmapHorizon {
	/** The version the horizon is aimed at, as the project writes it. */
	readonly version: string;
	readonly bumpHint?: IRoadmapBumpHint | undefined;
	readonly entries: readonly IRoadmapEntry[];
}

export interface IRoadmap {
	readonly schemaVersion: number;
	readonly horizons: readonly IRoadmapHorizon[];
}

/** The outcome of a check that explains itself instead of throwing. */
export type IRoadmapResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly reason: string };

/**
 * Derives the release bump the given entry kinds imply. Injected so this
 * package never decides a bump rule itself.
 */
export type IRoadmapBumpDeriver = (
	kinds: readonly IRoadmapEntryKind[],
) => IRoadmapBumpHint;
