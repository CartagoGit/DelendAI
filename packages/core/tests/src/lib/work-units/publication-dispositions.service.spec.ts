import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	waitingOnAuthor,
	writePublicationDispositions,
} from '../../../../src/lib/work-units/publication-dispositions.service';

describe('publication dispositions', () => {
	it('names the pull requests the last pass left to their author', async () => {
		const root = mkdtempSync(join(tmpdir(), 'dispositions-'));
		await writePublicationDispositions(root, [
			{
				number: 1179,
				headRef: 'delendai/pr/a/x',
				disposition: 'author',
				why: 'red again after being brought forward; its author pushes next',
			},
			{
				number: 1180,
				headRef: 'delendai/pr/b/y',
				disposition: 'moves-next',
				why: 'the head of the queue',
			},
		]);
		expect(
			(await waitingOnAuthor(root)).map((entry) => entry.number),
		).toEqual([1179]);
	});

	it('names none when the refresh has written nothing', async () => {
		expect(
			await waitingOnAuthor(mkdtempSync(join(tmpdir(), 'dispositions-'))),
		).toEqual([]);
	});
});
