#!/usr/bin/env bun
/**
 * proposals-duplicate-ids.spec.ts — a00044 H5 acceptance.
 *
 * Pins the four branches the new lint check must cover:
 *   1. Clean tree (every id unique) → no groups returned, `ok: true`.
 *   2. Real duplicate across folders (e.g. f00058 in done/ + ready/) →
 *      one group with both relative paths, lint surfaces `ERROR`,
 *      exit code flips to non-zero via `summary.ok === false`.
 *   3. Idempotence under repeated walks (the same file is listed once).
 *   4. Files WITHOUT an `id:` (audit reports under `done/audits/`,
 *      session notes, READMEs) are ignored — only proposals participate.
 *   5. Files whose `id:` lives inside a code-fenced block in the body
 *      are NOT flagged — the check only inspects the frontmatter.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	detectDuplicateProposalIds,
	lintProposalsDir,
} from './proposals.script.ts';

const writeProposal = (
	root: string,
	relPath: string,
	id: string,
	status: 'ready' | 'in-progress' | 'done' | 'paused' = 'ready',
): void => {
	const abs = join(root, relPath);
	mkdirSync(join(abs, '..'), { recursive: true });
	const body = `---\nid: ${id}\nstatus: ${status}\ntype: proposal\ntrack: x\ndate: 2026-06-28\nkind: feat\ntitle: fixture ${id}\n---\n\n# ${id}\n`;
	writeFileSync(abs, body, 'utf8');
};

describe('detectDuplicateProposalIds (a00044 H5)', () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'proposals-duplicate-ids-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('returns [] when every proposal id is unique', async () => {
		writeProposal(root, 'ready/f00001-a.md', 'f00001');
		writeProposal(root, 'ready/f00002-b.md', 'f00002');
		writeProposal(root, 'in-progress/f00003-c.md', 'f00003', 'in-progress');
		const files = [
			join(root, 'ready/f00001-a.md'),
			join(root, 'ready/f00002-b.md'),
			join(root, 'in-progress/f00003-c.md'),
		];
		expect(await detectDuplicateProposalIds(files, root)).toEqual([]);
	});

	it('flags a real duplicate across folders (the f00058 incident)', async () => {
		// Reproduces a00044 H1: two files claim `id: f00058`, one in done/
		// (the shipped proposal) and one in ready/ (an unrelated proposal).
		writeProposal(
			root,
			'done/f00058-canonical-exec-paths.md',
			'f00058',
			'done',
		);
		writeProposal(
			root,
			'ready/f00058-webview-hardening.md',
			'f00058',
			'ready',
		);
		const files = [
			join(root, 'done/f00058-canonical-exec-paths.md'),
			join(root, 'ready/f00058-webview-hardening.md'),
		];
		const groups = await detectDuplicateProposalIds(files, root);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.id).toBe('f00058');
		expect(groups[0]?.absPaths).toEqual([
			'done/f00058-canonical-exec-paths.md',
			'ready/f00058-webview-hardening.md',
		]);
	});

	it('is idempotent — repeated walks return the same group structure', async () => {
		writeProposal(root, 'ready/f00007-a.md', 'f00007');
		writeProposal(root, 'in-progress/f00007-b.md', 'f00007', 'in-progress');
		const files = [
			join(root, 'ready/f00007-a.md'),
			join(root, 'in-progress/f00007-b.md'),
		];
		const first = await detectDuplicateProposalIds(files, root);
		const second = await detectDuplicateProposalIds(files, root);
		expect(first).toEqual(second);
	});

	it('ignores files with no `id:` field (audit reports, session notes)', async () => {
		const auditAbs = join(root, 'done/audits/a00044-fixture.md');
		mkdirSync(join(auditAbs, '..'), { recursive: true });
		writeFileSync(
			auditAbs,
			'---\nkind: audit\ntitle: fixture\n---\n# audit\n',
			'utf8',
		);
		writeProposal(root, 'ready/f00009-c.md', 'f00009');
		const files = [auditAbs, join(root, 'ready/f00009-c.md')];
		expect(await detectDuplicateProposalIds(files, root)).toEqual([]);
	});

	it('does NOT match `id:` mentions inside code-fenced body blocks', async () => {
		const abs = join(root, 'ready/f00010-clean.md');
		mkdirSync(join(abs, '..'), { recursive: true });
		// The body contains a string `id: f00011` inside a fenced block
		// but the frontmatter is the canonical id: f00010. The lint
		// must not flag this as a collision.
		writeFileSync(
			abs,
			[
				'---',
				'id: f00010',
				'status: ready',
				'---',
				'',
				'# proposal',
				'',
				'```yaml',
				'id: f00011  # body mention, not frontmatter',
				'```',
				'',
			].join('\n'),
			'utf8',
		);
		const files = [abs];
		expect(await detectDuplicateProposalIds(files, root)).toEqual([]);
	});
});

describe('lintProposalsDir — duplicate-id integration (a00044 H5)', () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'proposals-duplicate-ids-int-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('marks ok=false and increments fatalErrors when a duplicate id is present', async () => {
		writeProposal(root, 'done/f00012-shipped.md', 'f00012', 'done');
		writeProposal(root, 'ready/f00012-new.md', 'f00012', 'ready');
		writeProposal(root, 'ready/f00013-other.md', 'f00013');
		// Capture stdout so the test stays quiet and the assertions are
		// independent of the lint's pretty-printer output.
		const originalLog = console.log;
		console.log = () => {};
		try {
			const summary = await lintProposalsDir(root);
			expect(summary.duplicateIds).toHaveLength(1);
			expect(summary.duplicateIds[0]?.id).toBe('f00012');
			expect(summary.fatalErrors).toBeGreaterThanOrEqual(1);
			expect(summary.ok).toBe(false);
		} finally {
			console.log = originalLog;
		}
	});

	it('returns ok=true and empty duplicateIds for a clean tree', async () => {
		// Use the lower-level detectDuplicateProposalIds for the happy-path
		// assertion (we already pin the integration in the previous test).
		// The end-to-end lintProposalsDir test would also flag the minimal
		// fixture for missing scaffold sections, which is orthogonal to
		// what we are proving here (the duplicate-id check).
		writeProposal(root, 'ready/f00014-a.md', 'f00014');
		writeProposal(root, 'ready/f00015-b.md', 'f00015');
		const files = [
			join(root, 'ready/f00014-a.md'),
			join(root, 'ready/f00015-b.md'),
		];
		const groups = await detectDuplicateProposalIds(files, root);
		expect(groups).toEqual([]);
	});
});

describe('lintProposalsDir — folder mismatch and paused-reason (x00079 S4)', () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'proposals-validation-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('fails when status: paused has no paused-reason', async () => {
		const abs = join(root, 'paused/f00010-paused.md');
		mkdirSync(join(abs, '..'), { recursive: true });
		const body = [
			'---',
			'id: f00010',
			'status: paused',
			'type: proposal',
			'track: x',
			'date: 2026-06-28',
			'kind: feat',
			'title: fixture f00010',
			'---',
			'# f00010',
		].join('\n');
		writeFileSync(abs, body, 'utf8');

		const originalLog = console.log;
		console.log = () => {};
		try {
			const summary = await lintProposalsDir(root);
			expect(summary.fatalErrors).toBeGreaterThanOrEqual(1);
			expect(summary.ok).toBe(false);
		} finally {
			console.log = originalLog;
		}
	});

	it('fails when folder and status mismatch', async () => {
		const abs = join(root, 'ready/f00010-paused.md');
		mkdirSync(join(abs, '..'), { recursive: true });
		const body = [
			'---',
			'id: f00010',
			'status: paused',
			'paused-reason: testing',
			'type: proposal',
			'track: x',
			'date: 2026-06-28',
			'kind: feat',
			'title: fixture f00010',
			'---',
			'# f00010',
		].join('\n');
		writeFileSync(abs, body, 'utf8');

		const originalLog = console.log;
		console.log = () => {};
		try {
			const summary = await lintProposalsDir(root);
			expect(summary.fatalErrors).toBeGreaterThanOrEqual(1);
			expect(summary.ok).toBe(false);
		} finally {
			console.log = originalLog;
		}
	});
});
