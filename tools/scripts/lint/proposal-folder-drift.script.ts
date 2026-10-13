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
	if (drift.length > 0) {
		// A proposal's folder and its status move together, and only
		// `proposal_transition` moves both along with the index, the state
		// database, `shipped-in` and the review rounds. On 2026-09-27 a
		// commit moved 131 proposals into done/ with `git mv`, their status
		// still `review`, and nothing else followed.
		console.log(
			'✖ proposal-folder-drift: a proposal sits in a folder its status does not name. Move proposals with proposal_transition (MCP) or `delendai proposals transition <id> <to> --reason=…`, never by editing the status or moving the file.',
		);
		return 1;
	}
	console.log('✓ proposal-folder-drift: no folder/status drift');
	return 0;
};

process.exit(await main());
