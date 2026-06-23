#!/usr/bin/env bun
/**
 * audit-ids.script.spec.ts — pins the contract of
 * `tools/scripts/lint/audit-ids.script.ts`.
 *
 * The script enforces the AGENTS.md §"Audits File Naming" uniqueness
 * half: every audit file under `docs/proposals/done/audits/` must carry
 * a unique `aNNNNN` id. The pure engine (`detectCollisions`) and the
 * pure parser (`parseIdFromFilename`) are tested in isolation here;
 * the I/O shell (`listAuditFiles`, `main`) is exercised via the CLI
 * smoke gate.
 *
 * SOLID: each describe block has a single responsibility.
 */
import { describe, expect, it } from 'vitest';

import {
	collectAuditCollisions,
	detectCollisions,
	parseIdFromFilename,
	type IAuditFile,
} from './audit-ids.script.ts';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('parseIdFromFilename', () => {
	it('extracts the id from a canonical filename', () => {
		expect(parseIdFromFilename('a00001-14-06-2026-foo-bar-baz.md')).toBe(
			'a00001',
		);
		expect(parseIdFromFilename('a12345-01-01-2026-x-y-z.md')).toBe(
			'a12345',
		);
	});

	it('returns null for non-canonical filenames', () => {
		expect(parseIdFromFilename('x00050-quick-wins.md')).toBeNull();
		expect(parseIdFromFilename('a1-not-zero-padded.md')).toBeNull();
		expect(parseIdFromFilename('README.md')).toBeNull();
		expect(parseIdFromFilename('a00001.md')).toBeNull(); // missing the trailing -DD-MM-YYYY
	});
});

describe('detectCollisions', () => {
	const file = (id: string, name: string): IAuditFile => ({ id, file: name });

	it('returns an empty list when every id is unique', () => {
		const files = [
			file('a00001', 'a00001-...md'),
			file('a00002', 'a00002-...md'),
		];
		expect(detectCollisions(files)).toEqual([]);
	});

	it('groups files that share the same id', () => {
		const files = [
			file('a00034', 'a00034-...-gemini-...md'),
			file('a00034', 'a00034-...-deepmind-...md'),
			file('a00035', 'a00035-...md'),
		];
		const collisions = detectCollisions(files);
		expect(collisions).toHaveLength(1);
		expect(collisions[0]?.id).toBe('a00034');
		expect(collisions[0]?.files).toEqual([
			'a00034-...-gemini-...md',
			'a00034-...-deepmind-...md',
		]);
	});

	it('sorts collisions by id (deterministic output for CI logs)', () => {
		const files = [
			file('a00005', 'a00005.md'),
			file('a00005', 'a00005-dup.md'),
			file('a00001', 'a00001.md'),
			file('a00001', 'a00001-dup.md'),
		];
		const collisions = detectCollisions(files);
		expect(collisions.map((c) => c.id)).toEqual(['a00001', 'a00005']);
	});
});

describe('collectAuditCollisions (integration: real filesystem under a temp dir)', () => {
	it('returns zero collisions for a fresh, all-unique folder', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'audit-ids-spec-'));
		try {
			await writeFile(join(dir, 'a00001-14-06-2026-x-y-z.md'), 'body');
			await writeFile(join(dir, 'a00002-14-06-2026-x-y-z.md'), 'body');
			// Use the audit-ids "root" semantics: it appends AUDITS_DIR
			// internally, so we point the script at the parent of a fake
			// `docs/proposals/done/audits/` layout.
			const fixtureRoot = await mkdtemp(
				join(tmpdir(), 'audit-ids-root-'),
			);
			const auditsDir = join(
				fixtureRoot,
				'docs',
				'proposals',
				'done',
				'audits',
			);
			await import('node:fs/promises').then((m) =>
				m.mkdir(auditsDir, { recursive: true }),
			);
			await writeFile(
				join(auditsDir, 'a00010-14-06-2026-x-y-z.md'),
				'body',
			);
			await writeFile(
				join(auditsDir, 'a00011-14-06-2026-x-y-z.md'),
				'body',
			);
			expect(await collectAuditCollisions(fixtureRoot)).toEqual([]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('detects a duplicate id across two filenames', async () => {
		const fixtureRoot = await mkdtemp(join(tmpdir(), 'audit-ids-root-'));
		try {
			const auditsDir = join(
				fixtureRoot,
				'docs',
				'proposals',
				'done',
				'audits',
			);
			await import('node:fs/promises').then((m) =>
				m.mkdir(auditsDir, { recursive: true }),
			);
			await writeFile(
				join(auditsDir, 'a00099-14-06-2026-x-y-z.md'),
				'body',
			);
			await writeFile(
				join(auditsDir, 'a00099-14-06-2026-x-y-dup.md'),
				'body',
			);
			const collisions = await collectAuditCollisions(fixtureRoot);
			expect(collisions).toHaveLength(1);
			expect(collisions[0]?.id).toBe('a00099');
			expect(collisions[0]?.files).toHaveLength(2);
		} finally {
			await rm(fixtureRoot, { recursive: true, force: true });
		}
	});
});
