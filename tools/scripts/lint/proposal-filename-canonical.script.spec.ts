/**
 * proposal-filename-canonical.script.spec.ts — reviewer point from
 * 2026-09-06: the canonical filename gate MUST catch every kind of
 * non-canonical file that has ever shown up on disk, including:
 *
 *  - `<date>-<id>-<slug>.md` (auto-repair cascade prefix)
 *  - `xauto-…md` (auto-repair UNKNOWN_REFUSAL filename)
 *  - 5-digit prefix but unknown kind letter
 *  - 4-digit prefix (was the legacy pre-f00016 width)
 *  - upper-case or whitespace in the slug
 *  - README / index / .gitkeep (which the gate explicitly exempts)
 *
 * Otherwise the gate is theatre. These tests cover each case against
 * an isolated scratch dir so they don't touch the real proposals
 * folder.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validate } from './proposal-filename-canonical.script';

let root = '';
let proposalsAbs = '';

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'proposal-filename-test-'));
	proposalsAbs = join(root, 'docs', 'delendai', 'proposals');
	await mkdir(proposalsAbs, { recursive: true });
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const touch = async (rel: string): Promise<void> => {
	await mkdir(join(proposalsAbs, ...rel.split('/').slice(0, -1)), {
		recursive: true,
	});
	await writeFile(join(proposalsAbs, rel), '');
};

describe('proposal-filename-canonical: reviewer point 2026-09-06', () => {
	it('reports the date-prefixed auto-repair file (the actual offender)', async () => {
		await touch(
			'ready/feats/2026-09-06-f00506-superseded-by-pre-existing-f00506.md',
		);
		const issues = validate(root);
		expect(issues.length).toBe(1);
		expect(issues[0]?.relPath).toBe(
			'ready/feats/2026-09-06-f00506-superseded-by-pre-existing-f00506.md',
		);
		expect(issues[0]?.message).toContain('canonical pattern');
	});

	it('reports the xauto-UNKNOWN_REFUSAL filename', async () => {
		await touch(
			'ready/repairs/xauto-UNKNOWN_REFUSAL-20260906-p6ph8h-auto-repair-UNKNOWN_REFUSAL.md',
		);
		const issues = validate(root);
		expect(issues.length).toBe(1);
		expect(issues[0]?.relPath).toContain('ready/repairs/');
		expect(issues[0]?.message).toContain('canonical pattern');
	});

	it('reports a 4-digit prefix (pre-f00016 width)', async () => {
		await touch('ready/x1234-some-slug.md');
		const issues = validate(root);
		expect(issues.length).toBe(1);
		expect(issues[0]?.message).toContain('canonical pattern');
	});

	it('reports an unknown kind prefix letter', async () => {
		await touch('ready/z00500-some-slug.md');
		const issues = validate(root);
		expect(issues.length).toBe(1);
		expect(issues[0]?.message).toContain('known proposal kind prefix');
	});

	it('reports upper-case in the slug', async () => {
		await touch('ready/f00500-SomeSlug.md');
		const issues = validate(root);
		expect(issues.length).toBe(1);
		expect(issues[0]?.message).toContain('canonical pattern');
	});

	it('reports whitespace / non-ASCII letters in the slug', async () => {
		await touch('ready/f00500-some slug.md');
		await touch('ready/f00501-otra-cosa-cazadora-ñ.md');
		const issues = validate(root);
		// Both files fail: first has whitespace, second has ñ
		expect(issues.length).toBe(2);
		expect(
			issues.every((i) => i.message.includes('canonical pattern')),
		).toBe(true);
	});

	it('passes when every filename is canonical', async () => {
		await touch(
			'ready/feats/f00506-validation-coordinator-misma-garantia-cache-por-digest.md',
		);
		await touch(
			'ready/fixes/x00504-sync-proposals-idempotente-move-file-rechaza-destino-conflictivo.md',
		);
		await touch(
			'ready/plans/q00019-state-engine-phase-1-sqlite-shadow-driver-parity-sampler.md',
		);
		const issues = validate(root);
		expect(issues.length).toBe(0);
	});

	it('exempts README and .gitkeep', async () => {
		await touch('ready/README.md');
		await touch('retired/.gitkeep');
		await touch('done/index.md');
		const issues = validate(root);
		expect(issues.length).toBe(0);
	});

	it('catches non-canonical files in non-status top-level dirs (repairs/)', async () => {
		await touch('ready/repairs/some-orphan.md');
		const issues = validate(root);
		expect(issues.length).toBe(1);
		expect(issues[0]?.relPath).toContain('ready/repairs/some-orphan.md');
	});
});
