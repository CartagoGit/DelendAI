import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	checkProposalUniqueness,
	collectProposalRecords,
	EXCLUDED_TOP_LEVEL_FOLDERS,
	findDuplicateProposals,
	folderOf,
	formatReport,
	lifecycleRank,
	main,
	readFrontmatterField,
	type IProposalSource,
} from './proposal-uniqueness.script';

const proposal = (
	relPath: string,
	id: string,
	status: string,
): IProposalSource => ({
	relPath,
	text: `---\nid: ${id}\nstatus: ${status}\nkind: feat\ntitle: fixture ${id}\n---\n\n# ${id}\n`,
});

describe('readFrontmatterField', () => {
	it('reads a scalar from the leading block', () => {
		expect(
			readFrontmatterField(proposal('ready/f00284-a.md', 'f00284', 'ready').text, 'id'),
		).toBe('f00284');
	});

	it('ignores an id that only appears in the body', () => {
		const text = '---\nstatus: ready\n---\n\n```yaml\nid: f00284\n```\n';
		expect(readFrontmatterField(text, 'id')).toBeUndefined();
	});

	it('returns undefined for a file with no frontmatter at all', () => {
		expect(readFrontmatterField('# just a readme\n', 'id')).toBeUndefined();
	});
});

describe('lifecycleRank', () => {
	it('orders the forward lifecycle ready < in-progress < review < done', () => {
		const ranks = ['ready', 'in-progress', 'review', 'done'].map((s) =>
			lifecycleRank(s),
		);
		expect(ranks).toEqual([0, 1, 2, 3]);
	});

	it('treats parked states as not comparable rather than as rank zero', () => {
		expect(lifecycleRank('paused')).toBeNull();
		expect(lifecycleRank('blocked')).toBeNull();
		expect(lifecycleRank('retired')).toBeNull();
		expect(lifecycleRank(undefined)).toBeNull();
	});
});

describe('folderOf', () => {
	it('names the status folder, and (root) for a bare file', () => {
		expect(folderOf('done/feats/f00284-a.md')).toBe('done');
		expect(folderOf('ready/f00284-a.md')).toBe('ready');
		expect(folderOf('README.md')).toBe('(root)');
	});
});

describe('collectProposalRecords', () => {
	it('keeps only files carrying a well-formed proposal id', () => {
		const records = collectProposalRecords([
			proposal('ready/feats/f00284-a.md', 'f00284', 'ready'),
			{ relPath: 'README.md', text: '# index\n' },
			{ relPath: 'done/notes.md', text: '---\nid: not-an-id\n---\n' },
		]);
		expect(records.map((r) => r.id)).toEqual(['f00284']);
	});

	it('excludes legacy/, the historical archive', () => {
		const records = collectProposalRecords([
			proposal('done/feats/f00284-a.md', 'f00284', 'done'),
			proposal('legacy/closed/feats/f00284-a.md', 'f00284', 'done'),
		]);
		expect(records.map((r) => r.relPath)).toEqual([
			'done/feats/f00284-a.md',
		]);
		expect([...EXCLUDED_TOP_LEVEL_FOLDERS]).toContain('legacy');
	});
});

describe('findDuplicateProposals', () => {
	it('is ok when every id lives in exactly one place', () => {
		const result = findDuplicateProposals(
			collectProposalRecords([
				proposal('ready/feats/f00284-a.md', 'f00284', 'ready'),
				proposal('done/feats/f00500-b.md', 'f00500', 'done'),
			]),
		);
		expect(result.ok).toBe(true);
		expect(result.scanned).toBe(2);
		expect(result.duplicates).toEqual([]);
	});

	it('flags the exact pair that froze sync_proposals, with both paths', () => {
		const result = findDuplicateProposals(
			collectProposalRecords([
				proposal('ready/feats/f00284-a.md', 'f00284', 'ready'),
				proposal('done/feats/f00284-a.md', 'f00284', 'done'),
			]),
		);
		expect(result.ok).toBe(false);
		expect(result.duplicates).toHaveLength(1);
		const group = result.duplicates[0];
		expect(group?.id).toBe('f00284');
		expect(group?.copies.map((c) => c.relPath)).toEqual([
			'done/feats/f00284-a.md',
			'ready/feats/f00284-a.md',
		]);
	});

	it('names the more advanced copy so the operator knows which to keep', () => {
		const result = findDuplicateProposals(
			collectProposalRecords([
				proposal('ready/feats/f00284-a.md', 'f00284', 'ready'),
				proposal('done/feats/f00284-a.md', 'f00284', 'done'),
			]),
		);
		expect(result.duplicates[0]?.mostAdvanced?.relPath).toBe(
			'done/feats/f00284-a.md',
		);
	});

	it('handles the three-folder case (x00323) and picks the furthest along', () => {
		const result = findDuplicateProposals(
			collectProposalRecords([
				proposal('ready/fixes/x00323-a.md', 'x00323', 'ready'),
				proposal('in-progress/x00323-a.md', 'x00323', 'in-progress'),
				proposal('review/x00323-a.md', 'x00323', 'review'),
			]),
		);
		expect(result.duplicates[0]?.copies).toHaveLength(3);
		expect(result.duplicates[0]?.mostAdvanced?.relPath).toBe(
			'review/x00323-a.md',
		);
	});

	it('refuses to name a winner when the copies tie', () => {
		const result = findDuplicateProposals(
			collectProposalRecords([
				proposal('ready/feats/f00284-a.md', 'f00284', 'ready'),
				proposal('ready/feats/f00284-b.md', 'f00284', 'ready'),
			]),
		);
		expect(result.duplicates[0]?.mostAdvanced).toBeNull();
	});

	it('refuses to name a winner when one copy is parked', () => {
		const result = findDuplicateProposals(
			collectProposalRecords([
				proposal('paused/f00284-a.md', 'f00284', 'paused'),
				proposal('done/feats/f00284-a.md', 'f00284', 'done'),
			]),
		);
		expect(result.duplicates[0]?.mostAdvanced).toBeNull();
	});

	it('does not report a legacy archive copy as a duplicate of the active one', () => {
		const result = findDuplicateProposals(
			collectProposalRecords([
				proposal('done/feats/f00284-a.md', 'f00284', 'done'),
				proposal('legacy/closed/feats/f00284-a.md', 'f00284', 'done'),
			]),
		);
		expect(result.ok).toBe(true);
	});
});

describe('formatReport', () => {
	it('reports a clean tree with the count', () => {
		const report = formatReport({ scanned: 709, duplicates: [], ok: true });
		expect(report).toContain('709 proposals');
		expect(report).toContain('legacy/ excluded');
	});

	it('lists every path and the copy to keep', () => {
		const report = formatReport(
			findDuplicateProposals(
				collectProposalRecords([
					proposal('ready/feats/f00284-a.md', 'f00284', 'ready'),
					proposal('done/feats/f00284-a.md', 'f00284', 'done'),
				]),
			),
		);
		expect(report).toContain('ready/feats/f00284-a.md');
		expect(report).toContain('done/feats/f00284-a.md');
		expect(report).toContain('most advanced: done/feats/f00284-a.md');
		expect(report).toContain('sync_proposals');
	});

	it('says UNDECIDABLE rather than guessing on a tie', () => {
		const report = formatReport(
			findDuplicateProposals(
				collectProposalRecords([
					proposal('ready/feats/f00284-a.md', 'f00284', 'ready'),
					proposal('ready/feats/f00284-b.md', 'f00284', 'ready'),
				]),
			),
		);
		expect(report).toContain('UNDECIDABLE');
	});
});

// End-to-end against a REAL directory tree, built in a temp fixture. The
// real docs/delendai/proposals tree is never written to by this spec.
describe('checkProposalUniqueness over a real fixture tree', () => {
	let root = '';

	const write = (relPath: string, id: string, status: string): void => {
		const abs = join(root, relPath);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, proposal(relPath, id, status).text, 'utf8');
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'proposal-uniqueness-'));
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('exits 0 on a clean fixture tree', () => {
		write('ready/feats/f00284-a.md', 'f00284', 'ready');
		write('done/feats/f00500-b.md', 'f00500', 'done');
		write('legacy/closed/feats/f00001-old.md', 'f00001', 'done');
		const result = checkProposalUniqueness(root);
		expect(result.ok).toBe(true);
		expect(result.scanned).toBe(2);
	});

	it('catches a duplicate written to disk, and main() exits 1', () => {
		write('ready/feats/f00284-a.md', 'f00284', 'ready');
		write('done/feats/f00284-a.md', 'f00284', 'done');
		const result = checkProposalUniqueness(root);
		expect(result.ok).toBe(false);
		expect(result.duplicates[0]?.id).toBe('f00284');

		// `main` joins PROPOSALS_DIR_REL onto the cwd it is given, so the
		// fixture is nested to match the real layout.
		const nested = mkdtempSync(join(tmpdir(), 'proposal-uniqueness-cwd-'));
		const dir = join(nested, 'docs', 'delendai', 'proposals', 'ready');
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, 'f00284-a.md'),
			proposal('ready/f00284-a.md', 'f00284', 'ready').text,
			'utf8',
		);
		mkdirSync(join(nested, 'docs/delendai/proposals/done/feats'), {
			recursive: true,
		});
		writeFileSync(
			join(nested, 'docs/delendai/proposals/done/feats/f00284-a.md'),
			proposal('done/feats/f00284-a.md', 'f00284', 'done').text,
			'utf8',
		);
		expect(main(nested)).toBe(1);
		rmSync(nested, { recursive: true, force: true });
	});
});
