/**
 * scan-proposal-registry.spec.ts — the registry, read without repairing
 * anything (x00629).
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { scanProposalRegistry } from '@delendai/proposals/lib/proposals/sync-proposal-registry';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const proposal = (id: string, status: string): string =>
	[
		'---',
		`id: ${id}`,
		`title: "${id}"`,
		'kind: fix',
		`status: ${status}`,
		'type: proposal',
		'track: general',
		'date: 2026-09-24',
		'---',
		'',
		`# ${id}`,
		'',
	].join('\n');

describe('scanProposalRegistry', () => {
	it('describes the proposals on disk and writes nothing at all', () => {
		const root = mkdtempSync(join(tmpdir(), 'scan-registry-'));
		roots.push(root);
		const ready = join(root, 'docs/delendai/proposals/ready');
		mkdirSync(ready, { recursive: true });
		writeFileSync(
			join(ready, 'x00001-in-place.md'),
			proposal('x00001', 'ready'),
		);
		// Misfiled: a sync would move it to review/.
		const misfiled = join(ready, 'x00002-misfiled.md');
		writeFileSync(misfiled, proposal('x00002', 'review'));

		return scanProposalRegistry(root).then(({ index, text }) => {
			expect(index.proposals.map((entry) => entry.id).sort()).toEqual([
				'x00001',
				'x00002',
			]);
			expect(JSON.parse(text).semantic_hash).toBe(index.semantic_hash);
			// Nothing moved, nothing written.
			expect(readFileSync(misfiled, 'utf8')).toBe(
				proposal('x00002', 'review'),
			);
			expect(
				existsSync(join(root, '.cache/delendai/proposals/index.json')),
			).toBe(false);
			expect(existsSync(join(root, '.cache'))).toBe(false);
		});
	});

	it('refuses a host folder that escapes the proposals dir', async () => {
		const root = mkdtempSync(join(tmpdir(), 'scan-registry-'));
		roots.push(root);
		await expect(
			scanProposalRegistry(root, undefined, ['../outside']),
		).rejects.toThrow('escapes proposalsDir');
	});
});
