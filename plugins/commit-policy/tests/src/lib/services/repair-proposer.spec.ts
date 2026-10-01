/**
 * repair-proposer.spec.ts — coverage for x00419 S5.
 *
 * The repair-proposer reads a StormDetector snapshot and writes
 * `kind: fix` proposals under a temp docs dir's
 * `proposals/ready/fixes/` folder. Tests cover the filter, the
 * filename generation, the body shape, the storm-key slug, and
 * the idempotency guard.
 *
 * Pre-2026-09-07 these tests pinned the old `kind: repair` +
 * `ready/repairs/` + hand-rolled `xauto-...` filename shape.
 * That contract was renamed to `kind: fix` + `ready/fixes/` +
 * canonical `xNNNNN-<kebab-slug>.md` after the xauto-UNKNOWN_REFUSAL
 * orphan was reported (the literal `id: auto` and the redundant
 * slug both violated the canonical filename gate).
 */

import {
	existsSync,
	mkdtempSync,
	rmSync,
	readdirSync,
	readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	buildRepairProposalFilename,
	fileRepairProposals,
	inferSourceFile,
	NO_PROPOSAL_STORE_REASON,
	stormSlug,
} from '@delendai/commit-policy/lib/services/repair-proposer';
import type { IProposalStorePort } from '@delendai/commit-policy/lib/services/repair-proposer';
import type { IStorm } from '@delendai/commit-policy/lib/services/storm-detector';
import {
	allocateNextProposalId,
	buildSwarmPaths,
	syncProposalRegistry,
} from '@delendai/proposals/public';

/**
 * x00535 S1 — the proposer no longer imports the proposals plugin; the
 * three store operations arrive as an injected `IProposalStorePort`.
 * The suite keeps exercising the REAL implementations so every
 * expectation below (canonical `xNNNNN` ids, the on-disk index.json)
 * still asserts against production behaviour — but the dependency now
 * lives in this spec, i.e. in commit-policy's devDependencies, and no
 * longer in its manifest `dependencies`, which is what the build-order
 * graph reads.
 */
const proposalStore: IProposalStorePort = {
	buildSwarmPaths,
	allocateNextProposalId,
	syncProposalRegistry,
};

const NOW = new Date('2026-09-02T23:30:00.000Z');

const makeStorm = (overrides: Partial<IStorm> = {}): IStorm => ({
	code: 'WORKSPACE_HAS_NO_FILES',
	trigger: 'slice',
	count: 7,
	windowSeconds: 30,
	sampleProposalIds: ['x00168', 'x00169', 'x00183'],
	firstSeenAt: NOW.getTime() - 30_000,
	windowStartedAt: NOW.getTime() - 30_000,
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

describe('stormSlug', () => {
	it('lowercases and kebab-cases a SCREAMING_SNAKE_CASE code', () => {
		expect(stormSlug('WORKSPACE_HAS_NO_FILES')).toBe(
			'workspace-has-no-files',
		);
	});

	it('strips leading and trailing dashes', () => {
		expect(stormSlug('--FOO--')).toBe('foo');
	});

	it('collapses runs of non-alphanumerics to a single dash', () => {
		expect(stormSlug('A  B__C--D')).toBe('a-b-c-d');
	});

	it('truncates to 60 characters', () => {
		const long = 'X'.repeat(120);
		expect(stormSlug(long)).toHaveLength(60);
	});
});

describe('buildRepairProposalFilename', () => {
	it('emits a canonical `<xNNNNN>-<kebab-slug>.md` under `fixes/`', () => {
		const f = buildRepairProposalFilename('x12345', makeStorm());
		expect(f).toMatch(/^fixes\/x\d{5}-workspace-has-no-files\.md$/);
	});

	it('uses a different slug for a different code', () => {
		const a = buildRepairProposalFilename('x12345', makeStorm());
		const b = buildRepairProposalFilename(
			'x12345',
			makeStorm({
				code: 'CAUSALITY_VIOLATION',
				firstSeenAt: 1_700_000_000_000,
			}),
		);
		expect(a.split('/').pop()).not.toBe(b.split('/').pop());
	});
});

describe('fileRepairProposals', () => {
	let workspaceRoot: string;
	let cacheDir: string;
	let docsDir: string;

	beforeEach(() => {
		workspaceRoot = mkdtempSync(join(tmpdir(), 'repair-proposer-test-'));
		cacheDir = join(workspaceRoot, '.cache', 'delendai');
		docsDir = join(workspaceRoot, 'docs', 'delendai');
	});

	afterEach(() => {
		rmSync(workspaceRoot, { recursive: true, force: true });
	});

	it('skips storms below the threshold', async () => {
		const storms = [makeStorm({ exceedsThreshold: false })];
		const results = await fileRepairProposals(storms, {
			workspaceRoot,
			cacheDir,
			docsDir,
			proposalStore,
			now: NOW,
		});
		expect(results[0]?.proposed).toBe(false);
		expect(results[0]?.reason).toBe('count < threshold');
		expect(results[0]?.filePath).toBe('');
	});

	it('skips storms with no sample proposal IDs', async () => {
		const storms = [makeStorm({ sampleProposalIds: [] })];
		const results = await fileRepairProposals(storms, {
			workspaceRoot,
			cacheDir,
			docsDir,
			proposalStore,
			now: NOW,
		});
		expect(results[0]?.proposed).toBe(false);
		expect(results[0]?.reason).toBe('sampleProposalIds < 1');
	});

	it('writes a `kind: fix` proposal into `ready/fixes/` with the source-file hint in ## Slices and syncs the index', async () => {
		const storms = [makeStorm()];
		const results = await fileRepairProposals(storms, {
			workspaceRoot,
			cacheDir,
			docsDir,
			proposalStore,
			now: NOW,
		});
		expect(results[0]?.proposed).toBe(true);

		const fixesDir = join(docsDir, 'proposals', 'ready', 'fixes');
		const files = readdirSync(fixesDir).filter((file) =>
			file.endsWith('.md'),
		);
		expect(files).toHaveLength(1);
		expect(files[0]).toMatch(/^x\d{5}-.*workspace-has-no-files.*\.md$/);

		const body = readFileSync(join(fixesDir, files[0] ?? ''), 'utf8');
		expect(body).toMatch(/^---\nid: x\d{5}\n/);
		expect(body).toContain('kind: fix');
		expect(body).toContain('status: ready');
		expect(body).not.toContain('kind: repair');
		expect(body).toMatch(/### S1 — Investigate the fall-through path/);
		expect(body).toMatch(/resolve-scope\.ts/);

		const indexBody = readFileSync(
			join(cacheDir, 'proposals', 'index.json'),
			'utf8',
		);
		expect(indexBody).toContain(files[0] ?? '');
	});

	it('falls back to a TBD Files hint when the producer gave no source file', async () => {
		const storms = [
			makeStorm({
				suggestedFix: undefined as unknown as string,
			}),
		];
		const results = await fileRepairProposals(storms, {
			workspaceRoot,
			cacheDir,
			docsDir,
			proposalStore,
			now: NOW,
		});
		expect(results[0]?.proposed).toBe(true);

		const fixesDir = join(docsDir, 'proposals', 'ready', 'fixes');
		const files = readdirSync(fixesDir).filter((file) =>
			file.endsWith('.md'),
		);
		const body = readFileSync(join(fixesDir, files[0] ?? ''), 'utf8');
		expect(body).toContain(
			'TBD — producer did not supply a source-file hint',
		);
	});

	it('is idempotent: a second run does not overwrite the existing proposal and still leaves it indexed', async () => {
		const storms = [makeStorm()];
		const r1 = await fileRepairProposals(storms, {
			workspaceRoot,
			cacheDir,
			docsDir,
			proposalStore,
			now: NOW,
		});
		const r2 = await fileRepairProposals(storms, {
			workspaceRoot,
			cacheDir,
			docsDir,
			proposalStore,
			now: NOW,
		});
		expect(r1[0]?.proposed).toBe(true);
		expect(r2[0]?.proposed).toBe(false);
		expect(r2[0]?.reason).toBe('already exists');

		const fixesDir = join(docsDir, 'proposals', 'ready', 'fixes');
		expect(
			readdirSync(fixesDir).filter((file) => file.endsWith('.md')),
		).toHaveLength(1);
		const indexBody = readFileSync(
			join(cacheDir, 'proposals', 'index.json'),
			'utf8',
		);
		expect(indexBody).toContain('workspace-has-no-files');
	});

	// x00535 S1 — the degraded path. With no store injected the
	// proposer must not write anything and must SAY why, so an
	// operator can tell "nothing worth filing" from "nowhere to file
	// it". The filter still runs first: a below-threshold storm is
	// still reported as below threshold, not as a missing port.
	it('files nothing and names the missing port when no proposal store is injected', async () => {
		const results = await fileRepairProposals(
			[makeStorm(), makeStorm({ exceedsThreshold: false })],
			{ workspaceRoot, cacheDir, docsDir, now: NOW },
		);
		expect(results[0]?.proposed).toBe(false);
		expect(results[0]?.reason).toBe(NO_PROPOSAL_STORE_REASON);
		expect(results[0]?.filePath).toBe('');
		expect(results[1]?.reason).toBe('count < threshold');
		expect(existsSync(join(docsDir, 'proposals'))).toBe(false);
		expect(existsSync(join(cacheDir, 'proposals', 'index.json'))).toBe(
			false,
		);
	});
});
