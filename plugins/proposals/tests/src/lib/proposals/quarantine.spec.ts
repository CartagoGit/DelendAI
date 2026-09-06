import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	appendQuarantine,
	listQuarantine,
} from '@delendai/proposals/lib/proposals/quarantine';

describe('proposal quarantine JSONL store', () => {
	let root = '';

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'proposal-quarantine-'));
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it('writes and reads an invalid canonical filename entry', async () => {
		const absPath = join(root, 'docs/delendai/proposals/ready/readme.md');
		const entry = await appendQuarantine(root, {
			absPath,
			blobSha: 'blob-1',
			sourceCommitSha: 'commit-1',
			detectedAt: 1,
			reason: 'invalid_canonical_filename',
			detail: "file name 'readme.md' does not match /^[a-z]\\d+[a-z]?-.+\\.md$/iu",
			rawMetadata: '',
		});

		const entries = await listQuarantine(root);
		expect(entry.reason).toBe('invalid_canonical_filename');
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			id: 1,
			absPath,
			reason: 'invalid_canonical_filename',
		});
	});

	it('serializes concurrent appends through the file mutex', async () => {
		const entries = await Promise.all(
			Array.from({ length: 10 }, (_, index) =>
				appendQuarantine(root, {
					absPath: join(
						root,
						`docs/delendai/proposals/ready/f0000${index}-x.md`,
					),
					blobSha: `blob-${index}`,
					sourceCommitSha: 'commit-concurrent',
					detectedAt: index,
					reason: 'invalid_status',
					detail: `invalid status ${index}`,
					rawMetadata: JSON.stringify({ status: `bad-${index}` }),
				}),
			),
		);

		const listed = await listQuarantine(root);
		expect(listed).toHaveLength(10);
		expect(new Set(listed.map((entry) => entry.id)).size).toBe(10);
		expect(
			[...listed.map((entry) => entry.id)].sort((a, b) => a - b),
		).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		expect(entries).toHaveLength(10);
	});

	it('round-trips the stored JSONL fields', async () => {
		const absPath = join(
			root,
			'docs/delendai/proposals/ready/f00042-alpha.md',
		);
		const created = await appendQuarantine(root, {
			absPath,
			blobSha: 'blob-42',
			sourceCommitSha: 'commit-42',
			detectedAt: 42,
			reason: 'invalid_frontmatter_shape',
			detail: 'missing string status',
			rawMetadata: JSON.stringify({ title: 'Alpha' }),
		});

		const listed = await listQuarantine(root);
		expect(listed).toEqual([created]);

		const jsonl = await readFile(
			join(root, '.cache/delendai/proposals/quarantine.jsonl'),
			'utf8',
		);
		expect(jsonl).toContain('"abs_path"');
		expect(jsonl).toContain('"raw_metadata"');
	});
});
