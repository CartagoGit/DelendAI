/**
 * unreadable-proposal.spec.ts — a proposal file that cannot be read is
 * reported as unreadable, never filed as one without frontmatter.
 *
 * Missing, unreadable, empty and invalid are four different answers. The
 * reader used to turn a read failure into an empty string, and the empty
 * string became "no frontmatter": a permissions fault quarantined as a
 * malformed proposal.
 */
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_PATH_LAYOUT } from '@delendai/proposals/lib/contracts/constants/default-path-layout.constant';
import { listQuarantine } from '@delendai/proposals/lib/proposals/quarantine';
import {
	findDuplicateProposalIds,
	reconcileAndArchiveCompletedRootProposals,
	syncProposalRegistry,
} from '@delendai/proposals/lib/proposals/sync-proposal-registry';
import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';

const NO_GIT: IGitRunner = async () => ({ ok: true, output: '' });
// Permission bits do not stop root, so these cases cannot be staged there.
const asRoot = process.getuid?.() === 0;

describe.skipIf(asRoot)('a proposal file that cannot be read', () => {
	let root = '';
	const locked: string[] = [];

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'unreadable-proposal-'));
	});
	afterEach(async () => {
		for (const path of locked.splice(0)) await chmod(path, 0o755);
		await rm(root, { recursive: true, force: true });
	});

	const proposals = () => resolve(root, DEFAULT_PATH_LAYOUT.proposalsDir);

	const unreadableProposal = async (): Promise<string> => {
		const dir = join(proposals(), 'ready');
		await mkdir(dir, { recursive: true });
		const file = join(dir, 'f00513-locked.md');
		await writeFile(file, '---\nid: f00513\nstatus: ready\n---\n', 'utf8');
		await chmod(file, 0o000);
		locked.push(file);
		return file;
	};

	it('is a warning of the sync, not a quarantine entry for missing frontmatter', async () => {
		await unreadableProposal();
		const result = await syncProposalRegistry(
			root,
			DEFAULT_PATH_LAYOUT,
			[],
			NO_GIT,
		);
		const quarantine = await listQuarantine(root);
		expect(quarantine.map((entry) => entry.reason)).not.toContain(
			'no_frontmatter',
		);
		expect(result.errors.join('\n')).toContain('could not be read');
	});

	it('fails the duplicate-id scan, since it could be the duplicate', async () => {
		await unreadableProposal();
		await expect(findDuplicateProposalIds(proposals())).rejects.toThrow(
			'could not be read',
		);
	});

	it('fails the legacy archival pass on an unreadable directory, as its contract says', async () => {
		await mkdir(proposals(), { recursive: true });
		await chmod(proposals(), 0o000);
		locked.push(proposals());
		await expect(
			reconcileAndArchiveCompletedRootProposals(proposals()),
		).rejects.toThrow();
	});

	it('still treats a proposals directory that does not exist as empty', async () => {
		await expect(
			reconcileAndArchiveCompletedRootProposals(proposals()),
		).resolves.toBeUndefined();
		expect(await findDuplicateProposalIds(proposals())).toEqual([]);
	});
});
