/**
 * "There is no work" and "I have not looked properly" are different
 * answers, and only one of them means create something.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { countProposalsOnDisk } from '@delendai/proposals/lib/proposals/backlog-on-disk';

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

const dir = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'backlog-on-disk-'));
	roots.push(root);
	return root;
};

describe('countProposalsOnDisk', () => {
	it('counts proposals at every depth, the way they are actually filed', async () => {
		const root = await dir();
		await mkdir(join(root, 'ready', 'fixes'), { recursive: true });
		await mkdir(join(root, 'done', 'feats'), { recursive: true });
		await writeFile(join(root, 'ready', 'fixes', 'x00001-a.md'), '---\n');
		await writeFile(join(root, 'done', 'feats', 'f00002-b.md'), '---\n');
		await writeFile(
			join(root, 'README.md'),
			'# not a proposal, still .md\n',
		);

		expect(await countProposalsOnDisk(root)).toBe(3);
	});

	it('counts a file it cannot parse, because the index should know it too', async () => {
		// More urgently, in fact: a file the index missed because it is
		// broken is exactly the case an agent must not paper over by
		// writing a second proposal.
		const root = await dir();
		await mkdir(join(root, 'ready'), { recursive: true });
		await writeFile(join(root, 'ready', 'broken.md'), 'no frontmatter\n');
		expect(await countProposalsOnDisk(root)).toBe(1);
	});

	it('answers zero for a directory that is not there', async () => {
		// No proposals directory is a real answer: there is nothing.
		expect(await countProposalsOnDisk('/nowhere/at/all')).toBe(0);
	});

	it('ignores everything that is not markdown', async () => {
		const root = await dir();
		await writeFile(join(root, 'index.json'), '{}');
		await writeFile(join(root, 'notes.txt'), 'x');
		expect(await countProposalsOnDisk(root)).toBe(0);
	});
});
