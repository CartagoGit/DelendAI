import type { IFinding } from '@delendai/core/public';

/**
 * backlog.interface.ts — f00139 S2: ranked self-audit backlog shapes.
 * Shared contract only; ranking logic lives in `self-audit/rank.ts`.
 */

export interface IBacklogWeights {
	readonly severity: number;
	readonly blastRadius: number;
	readonly effort: number;
}

export interface IBacklogItem {
	readonly finding: IFinding;
	readonly score: number;
	readonly rationale: string;
	readonly rank: number;
}

export type IBacklog = readonly IBacklogItem[];

export const DEFAULT_BACKLOG_WEIGHTS: IBacklogWeights = {
	severity: 2,
	blastRadius: 1,
	effort: 1,
};
