import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
	ProposalsSqliteDriver,
	reconcileShadowToStaging,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';

import {
	collectProposalMarkdown,
	resolveHeadCommit,
} from '../tools/db-reconcile.tool';

export interface IDbVerifyInput {
	readonly workspaceRoot: string;
	readonly proposalsDirAbs: string;
	readonly sourceCommit?: string;
}

export interface IDbVerifyOutput {
	readonly digestBefore: string | null;
	readonly digestAfter: string | null;
	readonly match: boolean;
	readonly durationMs: number;
	readonly sourceCommit: string;
}

export const verifyProposalsDb = (input: IDbVerifyInput): IDbVerifyOutput => {
	const started = Date.now();
	const sourceCommit =
		input.sourceCommit ?? resolveHeadCommit(input.workspaceRoot);
	const activePath = resolveProposalsDbPaths(input.workspaceRoot).databasePath;
	let digestBefore: string | null = null;
	if (existsSync(activePath)) {
		const driver = new ProposalsSqliteDriver({
			path: activePath,
			readonly: true,
		});
		try {
			digestBefore = driver.handle
				.query<{ logical_digest: string | null }, []>(
					"SELECT logical_digest FROM reconciliation_runs WHERE kind = 'promote' ORDER BY id DESC LIMIT 1",
				)
				.get()?.logical_digest ?? null;
		} finally {
			driver.close();
		}
	}
	const execRoot = join(
		resolveProposalsDbPaths(input.workspaceRoot).stateDir,
		'exec',
	);
	mkdirSync(execRoot, { recursive: true });
	const tempRoot = mkdtempSync(join(execRoot, 'db-verify-'));
	try {
		const tempProposals = join(tempRoot, 'proposals');
		cpSync(input.proposalsDirAbs, tempProposals, { recursive: true });
		const staged = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: tempRoot,
			sourceCommit,
			sha: sourceCommit,
			files: collectProposalMarkdown(tempProposals),
		});
		return {
			digestBefore,
			digestAfter: staged.stagingDigest,
			match: digestBefore !== null && digestBefore === staged.stagingDigest,
			durationMs: Date.now() - started,
			sourceCommit,
		};
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
};