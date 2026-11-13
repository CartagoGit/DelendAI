/**
 * repair-mode.interface.ts — the shapes of a repair-scoped auto_work
 * run: what it is told is broken, and what slices it proposes.
 */

import type { IProposalKind } from '../constants/proposal-glossary.constant';

export interface IRepairDraftInput {
	readonly failingFiles: readonly string[];
	readonly lastError: string;
	readonly headSha: string;
	readonly proposer: string;
	readonly agentId: string;
	readonly taskId: string;
	readonly nowIso: string;
}

export interface IRepairDraft {
	readonly id: string;
	readonly kind: IProposalKind;
	readonly title: string;
	readonly bodyMarkdown: string;
}
