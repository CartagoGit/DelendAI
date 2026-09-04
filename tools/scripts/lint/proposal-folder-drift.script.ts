#!/usr/bin/env bun

import { join } from 'node:path';

import { findProposalFolderDrift } from '../../../plugins/proposals/src/lib/proposals/sync-proposal-registry';
import { repoRoot } from '../lib/monorepo-paths';

const main = async (): Promise<number> => {
	const root = repoRoot();
	const proposalsDirAbs = join(root, 'docs', 'delendai', 'proposals');
	const drift = await findProposalFolderDrift(proposalsDirAbs);
	for (const entry of drift) {
		console.log(
			`${entry.id}: folder=${entry.folder} status=${entry.status} expected=${entry.expectedFolder} path=${entry.path}`,
		);
	}
	if (drift.length > 0) return 1;
	console.log('✓ proposal-folder-drift: no folder/status drift');
	return 0;
};

process.exit(await main());
