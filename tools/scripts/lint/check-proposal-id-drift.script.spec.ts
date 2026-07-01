#!/usr/bin/env bun
/**
 * check-proposal-id-drift.script.spec.ts — f00080 acceptance.
 *
 * Pins the five branches the drift lint must cover:
 *   1. Clean tree (counter ≥ filesystem max for every prefix) → ok.
 *   2. Drift positive: filesystem has f00079 but counter says f: 78.
 *      This is the live failure mode (28 f-ids and 75 x-ids skipped the
 *      allocator on 2026-06-28).
 *   3. Multiple prefixes drifting at once (f and x both past their counter).
 *   4. Missing counter file → summary.counters === null, lint errors.
 *   5. Filesystem-level collision (two .md with the same id) → reported
 *      alongside drift so the operator sees both signals in one run.
 *   6. A file with a legacy 3-digit prefix is still counted.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	collectProposalFiles,
	detectProposalIdDrift,
	readCounters,
} from './check-proposal-id-drift.script.ts';

const makeFixture = (root: string): string => {
	const proposalsDirAbs = join(root, 'docs', 'mcp-vertex', 'proposals');
	for (const folder of ['ready', 'in-progress', 'done', 'paused']) {
		mkdirSync(join(proposalsDirAbs, folder), { recursive: true });
	}
	return proposalsDirAbs;
};

const writeProposal = (
	proposalsDirAbs: string,
	folder: string,
	filename: string,
): void => {
	const abs = join(proposalsDirAbs, folder, filename);
	mkdirSync(join(abs, '..'), { recursive: true });
	writeFileSync(abs, '---\nid: x\n---\n# fixture\n', 'utf8');
};

const writeCounter = (root: string, counters: Record<string, number>): void => {
	const countersAbs = join(
		root,
		'.cache',
		'mcp-vertex',
		'proposal-id-counters.json',
	);
	mkdirSync(join(countersAbs, '..'), { recursive: true });
	writeFileSync(countersAbs, JSON.stringify(counters), 'utf8');
};

describe('collectProposalFiles (f00080)', () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'proposal-id-drift-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('returns [] when the proposals tree is empty', async () => {
		const proposalsDirAbs = makeFixture(root);
		expect(await collectProposalFiles(proposalsDirAbs)).toEqual([]);
	});

	it('skips files whose filename does not match the proposal shape', async () => {
		const proposalsDirAbs = makeFixture(root);
		writeProposal(proposalsDirAbs, 'ready', 'README.md');
		writeProposal(proposalsDirAbs, 'ready', 'session-notes.md');
		writeProposal(proposalsDirAbs, 'ready', 'a00099-fixture-audit.md');
		// The two non-proposal filenames are skipped; the audit-style
		// filename IS counted because `a` is the canonical prefix for
		// `kind: audit` (the only way to distinguish audit proposals
		// from audit reports is the frontmatter kind field, which the
		// drift lint intentionally does not parse — it operates on the
		// filename shape only).
		const collected = await collectProposalFiles(proposalsDirAbs);
		expect(collected).toHaveLength(1);
		expect(collected[0]).toContain('a00099-fixture-audit.md');
	});

	it('collects proposal files from every status folder', async () => {
		const proposalsDirAbs = makeFixture(root);
		writeProposal(proposalsDirAbs, 'ready', 'f00001-foo.md');
		writeProposal(proposalsDirAbs, 'in-progress', 'f00002-bar.md');
		writeProposal(proposalsDirAbs, 'done', 'f00003-baz.md');
		const collected = await collectProposalFiles(proposalsDirAbs);
		expect(collected).toHaveLength(3);
		expect(collected.every((p) => p.includes('proposals'))).toBe(true);
	});

	it('accepts legacy 3-digit ids (the post-f00023 migration is gradual)', async () => {
		const proposalsDirAbs = makeFixture(root);
		writeProposal(proposalsDirAbs, 'ready', 'f42-legacy.md');
		const collected = await collectProposalFiles(proposalsDirAbs);
		expect(collected).toHaveLength(1);
	});
});

describe('readCounters (f00080)', () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'proposal-id-drift-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('returns null when the file is missing', async () => {
		expect(await readCounters(join(root, 'missing.json'))).toBeNull();
	});

	it('returns null when the file is unparseable', async () => {
		const bad = join(root, 'bad.json');
		writeFileSync(bad, 'not json', 'utf8');
		expect(await readCounters(bad)).toBeNull();
	});

	it('parses valid counters and rejects invalid entries', async () => {
		const ok = join(root, 'ok.json');
		writeFileSync(
			ok,
			JSON.stringify({ f: 78, x: 12, F: 99, weird: -1, missing: 'no' }),
			'utf8',
		);
		const counters = await readCounters(ok);
		expect(counters).toEqual({ f: 78, x: 12 });
	});
});

describe('detectProposalIdDrift (f00080)', () => {
	let root: string;
	let proposalsDirAbs: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'proposal-id-drift-'));
		proposalsDirAbs = makeFixture(root);
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const countersPath = (): string =>
		join(root, '.cache', 'mcp-vertex', 'proposal-id-counters.json');

	it('clean tree: counter matches filesystem max per prefix → ok', async () => {
		writeProposal(proposalsDirAbs, 'ready', 'f00001-a.md');
		writeProposal(proposalsDirAbs, 'ready', 'f00002-b.md');
		writeProposal(proposalsDirAbs, 'in-progress', 'x00001-c.md');
		writeCounter(root, { f: 2, x: 1 });
		const summary = await detectProposalIdDrift(
			proposalsDirAbs,
			countersPath(),
		);
		expect(summary.ok).toBe(true);
		expect(summary.drifts).toEqual([]);
		expect(summary.collisions).toEqual([]);
	});

	it('drift positive: filesystem has f00079 but counter says f: 78', async () => {
		writeProposal(proposalsDirAbs, 'ready', 'f00079-out-of-band.md');
		writeCounter(root, { f: 78 });
		const summary = await detectProposalIdDrift(
			proposalsDirAbs,
			countersPath(),
		);
		expect(summary.ok).toBe(false);
		expect(summary.drifts).toHaveLength(1);
		const drift = summary.drifts[0];
		expect(drift?.prefix).toBe('f');
		expect(drift?.counterValue).toBe(78);
		expect(drift?.filesystemMax).toBe(79);
		expect(drift?.orphanAbsPaths).toHaveLength(1);
		expect(drift?.orphanAbsPaths[0]).toContain('f00079-out-of-band.md');
	});

	it('reports drift on multiple prefixes in one pass', async () => {
		writeProposal(proposalsDirAbs, 'ready', 'f00079-a.md');
		writeProposal(proposalsDirAbs, 'done', 'x00012-b.md');
		writeCounter(root, { f: 78, x: 11 });
		const summary = await detectProposalIdDrift(
			proposalsDirAbs,
			countersPath(),
		);
		expect(summary.drifts.map((d) => d.prefix).sort()).toEqual(['f', 'x']);
	});

	it('missing counter file → counters:null and the lint errors (operator sees a clear message)', async () => {
		writeProposal(proposalsDirAbs, 'ready', 'f00001-a.md');
		const summary = await detectProposalIdDrift(
			proposalsDirAbs,
			countersPath(),
		);
		expect(summary.counters).toBeNull();
		expect(summary.ok).toBe(false);
	});

	it('filesystem-level collision (two .md with the same id) is surfaced alongside drift', async () => {
		writeProposal(proposalsDirAbs, 'ready', 'f00058-canonical.md');
		writeProposal(proposalsDirAbs, 'ready', 'f00058-webview.md');
		writeCounter(root, { f: 58 });
		const summary = await detectProposalIdDrift(
			proposalsDirAbs,
			countersPath(),
		);
		expect(summary.collisions).toHaveLength(1);
		expect(summary.collisions[0]?.id).toBe('f00058');
		expect(summary.collisions[0]?.absPaths).toHaveLength(2);
		// Drift entry is still raised because the counter is in sync with
		// filesystem-max (58 == 58). The collision is the operator's
		// signal that they have to rename one of the two files.
		expect(summary.drifts).toHaveLength(0);
		expect(summary.ok).toBe(false);
	});

	it('legacy 3-digit ids are still counted toward the max', async () => {
		writeProposal(proposalsDirAbs, 'ready', 'l99-legacy.md');
		writeCounter(root, { l: 50 });
		const summary = await detectProposalIdDrift(
			proposalsDirAbs,
			countersPath(),
		);
		expect(summary.drifts).toHaveLength(1);
		expect(summary.drifts[0]?.prefix).toBe('l');
		expect(summary.drifts[0]?.filesystemMax).toBe(99);
	});
});
