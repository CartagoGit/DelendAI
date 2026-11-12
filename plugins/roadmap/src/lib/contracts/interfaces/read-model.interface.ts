import type { IBumpKind } from '@delendai/changelog/public';

import type {
	ROADMAP_DEFERRAL_POLICIES,
	ROADMAP_READINESS_STATUSES,
} from '../constants/read-model.constant';
import type { IRoadmapGateVerdict } from './gate.interface';
import type {
	IRoadmapBumpHint,
	IRoadmapEntry,
	IRoadmapEntryKind,
	IRoadmapEntryState,
	IRoadmapGateKind,
} from './roadmap.interface';
import type { IRoadmapTimelineEventKind } from './timeline.interface';

export type IRoadmapReadinessStatus =
	(typeof ROADMAP_READINESS_STATUSES)[number];
export type IRoadmapDeferralPolicy = (typeof ROADMAP_DEFERRAL_POLICIES)[number];

/** One entry as a listing shows it: no gates, no notes. */
export interface IRoadmapEntrySummary {
	readonly id: string;
	readonly title: string;
	readonly kind: IRoadmapEntryKind;
	readonly state: IRoadmapEntryState;
}

export interface IRoadmapHorizonSummary {
	readonly version: string;
	readonly bumpHint?: IRoadmapBumpHint | undefined;
	readonly counts: {
		readonly total: number;
		readonly delivered: number;
		readonly withdrawn: number;
		readonly open: number;
	};
	readonly entries: readonly IRoadmapEntrySummary[];
}

/** The whole entry, with the horizon it belongs to. */
export interface IRoadmapEntryDetail {
	readonly version: string;
	readonly entry: IRoadmapEntry;
}

/** What decides a promotion, declared by the project. */
export interface IRoadmapPromotionPolicy {
	/** The gate kinds that hold a promotion; every kind when absent. */
	readonly blockingGates?: readonly IRoadmapGateKind[] | undefined;
	readonly deferralPolicy?: IRoadmapDeferralPolicy | undefined;
}

/** A promised entry that holds its horizon back, and why. */
export interface IRoadmapBlocker {
	readonly entryId: string;
	readonly state: IRoadmapEntryState;
	readonly gates: IRoadmapGateVerdict;
}

export interface IRoadmapHorizonReadiness {
	readonly version: string;
	readonly status: IRoadmapReadinessStatus;
	readonly reason: string;
	/** Entries that fail a blocking gate, or are open under `block`. */
	readonly blockers: readonly IRoadmapBlocker[];
	/** Entries with no failure whose blocking gates lack evidence. */
	readonly unverified: readonly IRoadmapBlocker[];
	/** Open entries the `report` policy lets through: record them as deferred. */
	readonly toDefer: readonly string[];
	/**
	 * Open entries whose every gate passes: the evidence says delivered and
	 * the file does not. Close them (`roadmap_plan_close`), or the roadmap
	 * keeps a state its own gates contradict.
	 */
	readonly closable: readonly string[];
}

/** Declared, delivered, published — and what to do about the difference. */
export interface IRoadmapHorizonDelta {
	readonly version: string;
	/** The entries the horizon still promises. */
	readonly declared: readonly string[];
	/** Of those, the ones delivered. */
	readonly delivered: readonly string[];
	/** Whether the version is out; `null` when nobody can say. */
	readonly published: boolean | null;
	readonly bump: {
		readonly kind: IBumpKind;
		readonly authority: string;
		readonly declared?: IRoadmapBumpHint | undefined;
		readonly coherent: boolean;
	};
	readonly nextAction: string;
}

/** A change the authority file holds that the timeline has not recorded. */
export interface IRoadmapPendingEvent {
	readonly kind: IRoadmapTimelineEventKind;
	readonly horizon: string;
	readonly entryId?: string | undefined;
}

export interface IRoadmapSyncReport {
	readonly inSync: boolean;
	readonly recorded: number;
	readonly pending: readonly IRoadmapPendingEvent[];
}
