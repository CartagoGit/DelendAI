import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, expect, it } from 'vitest';
import { diffProposalsDb } from '../../../../src/lib/services/db-diff';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

it('returns canonical added and changed entries for SHA snapshots', () => {
	const root = mkdtempSync(join(tmpdir(), 'diff-service-'));
	roots.push(root);
	const from = join(root, '.git-snapshot-a');
	const until = join(root, '.git-snapshot-b');
	mkdirSync(from, { recursive: true });
	mkdirSync(until, { recursive: true });
	writeFileSync(join(from, 'old.md'), 'old');
	writeFileSync(join(until, 'old.md'), 'new');
	writeFileSync(join(until, 'new.md'), 'new');
	const result = diffProposalsDb({
		proposalsDirAbs: root,
		fromSha: 'a',
		untilSha: 'b',
	});
	expect(result.entries.map((entry) => entry.change)).toEqual([
		'added',
		'changed',
	]);
});
