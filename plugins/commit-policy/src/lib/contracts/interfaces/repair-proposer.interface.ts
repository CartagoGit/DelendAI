/**
 * repair-proposer.interface.ts — the shapes of an auto-filed repair
 * proposal request and its result.
 */

import type { IStorm } from './storm-detector.interface';

export interface IRepairProposerOptions {
	readonly docsDir: string;
	readonly now?: Date;
}

export interface IRepairProposalResult {
	readonly storm: IStorm;
	readonly filePath: string;
	readonly proposed: boolean;
	readonly reason: string;
}
