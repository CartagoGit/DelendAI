/**
 * repair-proposer.interface.ts — the shapes of an auto-filed repair
 * proposal request and its result.
 *
 * `now` is kept on the options for callers that want to
 * deterministically reproduce a past boot's outputs in a test, but
 * the canonical id is derived from `IStorm.firstSeenAt` (lifetime
 * identity), not from `now` — so two runs on the same storm
 * always produce the same filename.
 */

import type { IStorm } from './storm-detector.interface';

export interface IRepairProposerOptions {
	readonly workspaceRoot: string;
	readonly cacheDir: string;
	readonly docsDir: string;
	/**
	 * @deprecated kept for backward compat with tests; the
	 * proposal id is allocated canonically from the proposals
	 * counter, so `now` only stabilises timestamps in tests.
	 */
	readonly now?: Date;
}

export interface IRepairProposalResult {
	readonly storm: IStorm;
	readonly filePath: string;
	readonly proposed: boolean;
	readonly reason: string;
}
