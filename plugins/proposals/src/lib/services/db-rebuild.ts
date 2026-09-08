import { existsSync } from 'node:fs';

import {
	OutboxRepo,
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';

import {
	reconcileProposalsDb,
	resolveHeadCommit,
	type IDbReconcileOutput,
} from '../tools/db-reconcile.tool';

export interface IDbRebuildInput {
	readonly workspaceRoot: string;
	readonly proposalsDirAbs: string;
	readonly apply?: boolean;
	readonly confirm?: string;
	readonly sourceCommit?: string;
	readonly now?: number;
}

export type IDbRebuildOutput = IDbReconcileOutput & {
	readonly applied: boolean;
	readonly proposedSha: string;
	readonly confirmationRequired: boolean;
};

const preview = (
	input: IDbRebuildInput,
	proposedSha: string,
	): IDbRebuildOutput => {
	const output = reconcileProposalsDb({
		workspaceRoot: input.workspaceRoot,
		proposalsDirAbs: input.proposalsDirAbs,
		sourceCommit: proposedSha,
		dryRun: true,
		...(input.now !== undefined ? { now: input.now } : {}),
	});
	return {
		...output,
		applied: false,
		proposedSha,
		confirmationRequired: input.apply === true,
	};
};

export const rebuildProposalsDb = (
	input: IDbRebuildInput,
): IDbRebuildOutput => {
	const proposedSha =
		input.sourceCommit ?? resolveHeadCommit(input.workspaceRoot);
	if (input.apply !== true || input.confirm === undefined) {
		return preview(input, proposedSha);
	}
	if (input.confirm !== proposedSha) {
		const output = preview(input, proposedSha);
		return {
			...output,
			status: 'rejected',
			reason: `confirmation SHA does not match proposed SHA ${proposedSha}`,
			confirmationRequired: true,
		};
	}

	const output = reconcileProposalsDb({
		workspaceRoot: input.workspaceRoot,
		proposalsDirAbs: input.proposalsDirAbs,
		sourceCommit: proposedSha,
		...(input.now !== undefined ? { now: input.now } : {}),
	});
	if (output.status === 'ok' && existsSync(output.databasePath)) {
		const driver = new ProposalsSqliteDriver({ path: output.databasePath });
		try {
			new OutboxRepo(driver.handle).enqueue({
				idempotencyKey: `db-rebuild:${proposedSha}:${output.logicalDigest ?? 'none'}`,
				kind: 'proposals-db-rebuilt',
				payload: JSON.stringify({
					sourceCommit: proposedSha,
					logicalDigest: output.logicalDigest,
				}),
				now: input.now,
			});
		} finally {
			driver.close();
		}
	}
	return {
		...output,
		applied: output.status === 'ok',
		proposedSha,
		confirmationRequired: false,
	};
};

export const dbRebuildPaths = (workspaceRoot: string) =>
	resolveProposalsDbPaths(workspaceRoot);