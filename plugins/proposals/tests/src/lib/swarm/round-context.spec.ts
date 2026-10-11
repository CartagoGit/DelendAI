import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	computeFingerprint,
	computeAgeMinutes,
	computeCoreDocHashes,
} from '../../../../src/lib/swarm/round-context-hash';

import {
	isDigestStale,
	readRoundContextDigest,
	writeRoundContextDigest,
	buildRoundContextDigest,
} from '../../../../src/lib/swarm/round-context-digest';
import type {
	IRoundContextDigestInput,
	IRoundContextSourceMeta,
} from '../../../../src/lib/swarm/round-context-types';

describe('round-context-hash', async () => {
	it('computeFingerprint returns an rh- prefixed 16-char hex', async () => {
		const hash = computeFingerprint('hello world');
		expect(hash).toMatch(/^rh-[a-f0-9]{16}$/);
		expect(computeFingerprint('hello world')).toBe(hash);
	});

	it('computeAgeMinutes calculates correct age', async () => {
		expect(computeAgeMinutes(null)).toBeNull();
		expect(computeAgeMinutes('invalid-date')).toBeNull();

		const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
		expect(computeAgeMinutes(tenMinutesAgo)).toBeGreaterThanOrEqual(9);
		expect(computeAgeMinutes(tenMinutesAgo)).toBeLessThanOrEqual(10);
	});

	it('computeCoreDocHashes calculates hashes for files', async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'core-docs-'));
		writeFileSync(join(workspace, 'file1.txt'), 'content 1');

		try {
			const hashes = await computeCoreDocHashes(workspace, [
				'file1.txt',
				'missing.txt',
			]);
			expect(hashes['file1.txt']).toMatch(/^rh-[a-f0-9]{16}$/);
			expect(hashes['missing.txt']).toBe('rh-missing');
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});
});

describe('round-context-digest', async () => {
	let workspace: string;
	let digestPath: string;

	beforeEach(() => {
		workspace = mkdtempSync(join(tmpdir(), 'digest-test-'));
		digestPath = join(workspace, 'round-context.digest.json');
	});

	afterEach(() => {
		rmSync(workspace, { recursive: true, force: true });
	});

	const dummySource: IRoundContextSourceMeta = {
		state: 'ok',
		fingerprint: 'rh-000',
		timestamp: new Date().toISOString(),
		ageMinutes: 0,
		temporallyStale: false,
	};

	const getDummyInput = (): IRoundContextDigestInput => ({
		roundId: 'r1',
		activeProposalId: 'p1',
		currentTaskId: 't1',
		activeLocks: [],
		activeAgents: [],
		coreDocHashes: { 'a.md': 'rh-123' },
		sources: {
			chatContext: dummySource,
			checkpoint: dummySource,
			lock: dummySource,
			registry: dummySource,
		},
		chatContext: { proposalIds: [] },
		checkpoint: {},
		proposalPortfolio: {
			sourceState: 'ok',
			strategy: 'index',
			activeIds: [],
			activeOverflowCount: 0,
			activeCount: 0,
			pendingCount: 0,
			inProgressCount: 0,
		},
		resumeHint: { mode: 'unknown', proposalId: 'p1', reason: 'none' },
	});

	it('buildRoundContextDigest builds digest correctly', async () => {
		const input = getDummyInput();
		const digest = buildRoundContextDigest(input);
		expect(digest.digestVersion).toBe(1);
		expect(digest.createdAt).toBeDefined();
		expect(digest.roundId).toBe('r1');
	});

	it('reads and writes digest atomically', async () => {
		const digest = buildRoundContextDigest(getDummyInput());
		await writeRoundContextDigest(digest, digestPath);

		const read = await readRoundContextDigest(digestPath);
		expect(read).not.toBeNull();
		expect(read?.coreDocHashes['a.md']).toBe('rh-123');
	});

	it('isDigestStale checks core docs and sources', async () => {
		const digest = buildRoundContextDigest(getDummyInput());

		// Not stale
		expect(
			isDigestStale(digest, { 'a.md': 'rh-123' }, digest.sources),
		).toBe(false);

		// Stale due to mismatch core docs
		expect(
			isDigestStale(digest, { 'a.md': 'rh-456' }, digest.sources),
		).toBe(true);
	});
});
