/**
 * migrate-foreign.spec.ts — f00116 S2.
 *
 * The migration engine converts FOREIGN proposal schemes into canonical
 * mcp-vertex proposals: rfc-style docs, TODO checklists, and ad-hoc
 * frontmatter files. Copies + converts with provenance; originals are
 * never touched; secrets never persist.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migrateForeign } from '@delendai/proposals/lib/proposals/migrate-foreign';

describe('migrateForeign (f00116 S2)', () => {
	let root = '';
	let proposalsDirAbs = '';

	const write = (rel: string, content: string): void => {
		const abs = join(root, rel);
		mkdirSync(join(abs, '..'), { recursive: true });
		writeFileSync(abs, content, 'utf8');
	};

	const run = async (roots: readonly string[]) =>
		migrateForeign({
			workspaceRoot: root,
			proposalsDirAbs,
			counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
			roots,
		});

	const runAuditMigration = async (roots: readonly string[]) =>
		migrateForeign({
			workspaceRoot: root,
			proposalsDirAbs,
			counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
			roots,
			removeMigratedSources: true,
		});

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'migrate-foreign-'));
		proposalsDirAbs = join(root, 'docs/mcp-vertex/proposals');
		mkdirSync(join(proposalsDirAbs, 'ready'), { recursive: true });
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('converts rfc-style docs into ready proposals with provenance', async () => {
		write(
			'docs/rfcs/dark-mode.md',
			'# Add dark mode\n\nUsers keep asking for a dark theme.\n',
		);
		const report = await run(['docs/rfcs']);
		expect(report.migrated).toHaveLength(1);
		const entry = report.migrated[0]!;
		expect(entry.source).toBe('docs/rfcs/dark-mode.md');
		expect(entry.id).toMatch(/^f\d{5}$/);
		const target = await readFile(join(root, entry.target), 'utf8');
		expect(target).toContain(`id: ${entry.id}`);
		expect(target).toContain('status: ready');
		expect(target).toContain('Add dark mode');
		expect(target).toContain('docs/rfcs/dark-mode.md'); // provenance
		// The original is untouched.
		expect(existsSync(join(root, 'docs/rfcs/dark-mode.md'))).toBe(true);
	});

	it('infers fix kind for bug-ish titles (x prefix)', async () => {
		write(
			'docs/rfcs/crash.md',
			'# Fix crash when saving\n\nThe app crashes on save.\n',
		);
		const report = await run(['docs/rfcs']);
		expect(report.migrated[0]!.id).toMatch(/^x\d{5}$/);
	});

	it('converts unchecked TODO checklist items; checked ones are skipped with a reason', async () => {
		write(
			'TODO.md',
			[
				'# Backlog',
				'',
				'- [ ] Ship exports',
				'- [x] Old done thing',
			].join('\n'),
		);
		const report = await run(['TODO.md']);
		expect(report.migrated).toHaveLength(1);
		const body = await readFile(
			join(root, report.migrated[0]!.target),
			'utf8',
		);
		expect(body).toContain('Ship exports');
		expect(report.skipped.some((s) => s.reason.includes('checked'))).toBe(
			true,
		);
	});

	it('maps ad-hoc frontmatter (title/status) and honours done-ish statuses', async () => {
		write(
			'planning/feature-x.md',
			[
				'---',
				'title: Feature X',
				'status: shipped',
				'---',
				'',
				'Body.',
			].join('\n'),
		);
		const report = await run(['planning']);
		expect(report.migrated).toHaveLength(1);
		const target = report.migrated[0]!.target;
		expect(target).toContain('done/');
		const body = await readFile(join(root, target), 'utf8');
		expect(body).toContain('status: done');
	});

	it('redacts secrets pasted into foreign bodies before persisting', async () => {
		write(
			'docs/rfcs/creds.md',
			'# Rotate keys\n\ntoken: ghp_0123456789abcdefghijklmnopqrstuvwxyz1234\n',
		);
		const report = await run(['docs/rfcs']);
		const body = await readFile(
			join(root, report.migrated[0]!.target),
			'utf8',
		);
		expect(body).not.toContain(
			'ghp_0123456789abcdefghijklmnopqrstuvwxyz1234',
		);
	});

	it('never writes outside the proposals dir and skips the store itself', async () => {
		write('docs/rfcs/one.md', '# One\n\nBody.\n');
		const before = await readdir(join(root, 'docs/rfcs'));
		await run(['docs/rfcs', 'docs/mcp-vertex/proposals']);
		const after = await readdir(join(root, 'docs/rfcs'));
		expect(after).toEqual(before);
	});

	it('re-running does not duplicate already-migrated sources', async () => {
		write('docs/rfcs/one.md', '# One\n\nBody.\n');
		await run(['docs/rfcs']);
		const second = await run(['docs/rfcs']);
		expect(second.migrated).toEqual([]);
		expect(
			second.skipped.some((s) => s.reason.includes('already migrated')),
		).toBe(true);
	});

	it('maps foreign statuses to canonical folders (in-progress, blocked, paused, retired)', async () => {
		write(
			'planning/a.md',
			['---', 'title: A', 'status: in-progress', '---', '', 'Body.'].join(
				'\n',
			),
		);
		write(
			'planning/b.md',
			['---', 'title: B', 'status: blocked', '---', '', 'Body.'].join(
				'\n',
			),
		);
		write(
			'planning/c.md',
			['---', 'title: C', 'status: on-hold', '---', '', 'Body.'].join(
				'\n',
			),
		);
		write(
			'planning/d.md',
			['---', 'title: D', 'status: archived', '---', '', 'Body.'].join(
				'\n',
			),
		);
		const report = await run(['planning']);
		const targets = report.migrated.map((m) => m.target);
		expect(targets.some((t) => t.includes('/in-progress/'))).toBe(true);
		expect(targets.some((t) => t.includes('/blocked/'))).toBe(true);
		expect(targets.some((t) => t.includes('/paused/'))).toBe(true);
		expect(targets.some((t) => t.includes('/retired/'))).toBe(true);
	});

	it('preserves frontmatter kind instead of degrading to a title-regex guess', async () => {
		write(
			'planning/docs.md',
			[
				'---',
				'title: Fix the broken docs',
				'kind: docs',
				'---',
				'',
				'Body.',
			].join('\n'),
		);
		const report = await run(['planning']);
		// A docs kind (d prefix) even though the title says "fix".
		expect(report.migrated[0]!.id).toMatch(/^d\d{5}$/);
	});

	it('archives audit reports as done/audits proposals and removes the source', async () => {
		write(
			'docs/mcp-vertex/audits/2026-08-30-audit.md',
			'# Full project audit\n\nEvidence and findings.\n',
		);
		const report = await runAuditMigration(['docs/mcp-vertex/audits']);
		expect(report.migrated).toHaveLength(1);
		expect(report.migrated[0]!.id).toMatch(/^a\d{5}$/);
		expect(report.migrated[0]!.target).toContain('done/audits/');
		expect(
			existsSync(
				join(root, 'docs/mcp-vertex/audits/2026-08-30-audit.md'),
			),
		).toBe(false);
		const body = await readFile(
			join(root, report.migrated[0]!.target),
			'utf8',
		);
		expect(body).toContain('kind: audit');
		expect(body).toContain('status: done');
	});
});
