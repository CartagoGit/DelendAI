/**
 * repair-proposer.spec.ts — coverage for x00419 S5.
 *
 * The repair-proposer reads a StormDetector snapshot and writes
 * `kind: repair` proposals under a temp docs dir. Tests cover the
 * filter, the filename generation, the body shape, and the
 * idempotency guard.
 */

import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	buildRepairProposalFilename,
	fileRepairProposals,
	inferSourceFile,
} from '@mcp-vertex/commit-policy/lib/services/repair-proposer';
import type { IStorm } from '@mcp-vertex/commit-policy/lib/services/storm-detector';

const NOW = new Date('2026-09-02T23:30:00.000Z');

const makeStorm = (overrides: Partial<IStorm> = {}): IStorm => ({
	code: 'WORKSPACE_HAS_NO_FILES',
	trigger: 'slice',
	count: 7,
	windowSeconds: 30,
	sampleProposalIds: ['x00168', 'x00169', 'x00183'],
	firstSeenAt: NOW.getTime() - 30_000,
	lastSeenAt: NOW.getTime() - 1_000,
	exceedsThreshold: true,
	suggestedFix: 'resolve-scope.ts: files is empty after the stage step',
	...overrides,
});

describe('inferSourceFile', () => {
	it('returns the file portion of "<file>: <hint>"', () => {
		expect(inferSourceFile('resolve-scope.ts: files is empty')).toBe(
			'resolve-scope.ts',
		);
	});

	it('returns undefined when there is no colon', () => {
		expect(inferSourceFile('look at foo.ts')).toBeUndefined();
	});

	it('returns undefined when the candidate has spaces', () => {
		expect(inferSourceFile('my file.ts: hint')).toBeUndefined();
	});

	it('returns undefined when the candidate is not a .ts or .json file', () => {
		expect(inferSourceFile('README: hint')).toBeUndefined();
	});
});

describe('buildRepairProposalFilename', () => {
	it('includes the code and the date slug', () => {
		const f = buildRepairProposalFilename(makeStorm(), NOW);
		expect(f).toMatch(/^repairs\/xauto-WORKSPACE_HAS_NO_FILES-20260902-/);
		expect(f).toMatch(/-auto-repair-WORKSPACE_HAS_NO_FILES\.md$/);
	});
});

describe('fileRepairProposals', () => {
	let docsDir: string;

	beforeEach(() => {
		docsDir = mkdtempSync(join(tmpdir(), 'repair-proposer-test-'));
	});

	afterEach(() => {
		rmSync(docsDir, { recursive: true, force: true });
	});

	it('skips storms below the threshold', () => {
		const storms = [makeStorm({ exceedsThreshold: false })];
		const results = fileRepairProposals(storms, { docsDir, now: NOW });
		expect(results[0]?.proposed).toBe(false);
		expect(results[0]?.reason).toBe('count < threshold');
		expect(results[0]?.filePath).toBe('');
	});

	it('skips storms with no sample proposal IDs', () => {
		const storms = [makeStorm({ sampleProposalIds: [] })];
		const results = fileRepairProposals(storms, { docsDir, now: NOW });
		expect(results[0]?.proposed).toBe(false);
		expect(results[0]?.reason).toBe('sampleProposalIds < 1');
	});

	it('writes a proposal with kind: repair and the source-file hint in Files:', () => {
		const storms = [makeStorm()];
		const results = fileRepairProposals(storms, { docsDir, now: NOW });
		expect(results[0]?.proposed).toBe(true);

		const repairsDir = join(docsDir, 'proposals', 'ready', 'repairs');
		const files = readdirSync(repairsDir);
		expect(files).toHaveLength(1);
		const body = readFileSync(join(repairsDir, files[0] ?? ''), 'utf8');
		expect(body).toContain('kind: repair');
		expect(body).toContain('Files');
		expect(body).toMatch(/resolve-scope\.ts/);
	});

	it('is idempotent: a second run does not overwrite the existing proposal', () => {
		const storms = [makeStorm()];
		const r1 = fileRepairProposals(storms, { docsDir, now: NOW });
		const r2 = fileRepairProposals(storms, { docsDir, now: NOW });
		expect(r1[0]?.proposed).toBe(true);
		expect(r2[0]?.proposed).toBe(false);
		expect(r2[0]?.reason).toBe('already exists');
	});
});
