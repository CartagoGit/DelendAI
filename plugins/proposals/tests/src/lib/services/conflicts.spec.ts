import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, expect, it } from 'vitest';
import { listProposalConflicts } from '../../../../src/lib/services/conflicts';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

it('returns no conflicts for an absent database', () => {
	const root = mkdtempSync(join(tmpdir(), 'conflicts-service-'));
	roots.push(root);
	mkdirSync(join(root, 'docs'), { recursive: true });
	writeFileSync(join(root, 'marker'), 'fixture');
	const result = listProposalConflicts(root);
	expect(result.conflicts).toEqual([]);
});
