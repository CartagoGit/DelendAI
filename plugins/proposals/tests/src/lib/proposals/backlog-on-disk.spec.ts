/**
 * "There is no work" and "I have not looked properly" are different
 * answers, and only one of them means create something.
 */
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { probeProposalsOnDisk } from '@delendai/proposals/lib/proposals/backlog-on-disk';

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) {
		// A test may have taken read permission away; give it back so the
		// directory can be removed.
		await chmod(join(root, 'locked'), 0o755).catch(() => undefined);
		await rm(root, { recursive: true, force: true });
	}
});

const dir = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'backlog-on-disk-'));
	roots.push(root);
	return root;
};

describe('probeProposalsOnDisk', () => {
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

		expect(await probeProposalsOnDisk(root)).toEqual({
			status: 'ok',
			count: 3,
		});
	});

	it('counts a file it cannot parse, because the index should know it too', async () => {
		// More urgently, in fact: a file the index missed because it is
		// broken is exactly the case an agent must not paper over by
		// writing a second proposal.
		const root = await dir();
		await mkdir(join(root, 'ready'), { recursive: true });
		await writeFile(join(root, 'ready', 'broken.md'), 'no frontmatter\n');
		expect(await probeProposalsOnDisk(root)).toEqual({
			status: 'ok',
			count: 1,
		});
	});

	it('answers missing for a directory that is not there', async () => {
		// No proposals directory is a real answer: there is nothing.
		expect(await probeProposalsOnDisk('/nowhere/at/all')).toEqual({
			status: 'missing',
		});
	});

	// Root ignores directory permissions, so there the directory is not
	// unreadable and the case does not exist to test.
	it.skipIf(process.getuid?.() === 0)(
		'answers unreadable, not zero, when a directory inside cannot be listed',
		async () => {
			// The defect: an unreadable directory contributed nothing, and the
			// count it produced decided between "sync the index" and "create
			// a proposal". Unknown is not empty.
			const root = await dir();
			const locked = join(root, 'locked');
			await mkdir(locked);
			await writeFile(join(locked, 'x00001-a.md'), '---\n');
			await chmod(locked, 0o000);
			expect(await probeProposalsOnDisk(root)).toMatchObject({
				status: 'unreadable',
				dir: locked,
			});
		},
	);

	it('answers unreadable when the proposals path is not a directory', async () => {
		const root = await dir();
		const file = join(root, 'proposals');
		await writeFile(file, 'not a directory');
		expect(await probeProposalsOnDisk(file)).toMatchObject({
			status: 'unreadable',
			dir: file,
		});
	});

	it('ignores everything that is not markdown', async () => {
		const root = await dir();
		await writeFile(join(root, 'index.json'), '{}');
		await writeFile(join(root, 'notes.txt'), 'x');
		expect(await probeProposalsOnDisk(root)).toEqual({
			status: 'ok',
			count: 0,
		});
	});
});
