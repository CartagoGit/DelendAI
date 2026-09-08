import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, expect, it } from 'vitest';
import { verifyProposalsDb } from '../../../../src/lib/services/db-verify';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

it('rebuilds in a temporary database without requiring an active database', () => {
	const root = mkdtempSync(join(tmpdir(), 'verify-service-'));
	roots.push(root);
	const proposals = join(root, 'proposals');
	mkdirSync(proposals, { recursive: true });
	writeFileSync(
		join(proposals, 'q00001.md'),
		'---\nid: q00001\ntitle: Verify\nkind: feat\nstatus: ready\n---\n# Verify\n',
	);
	const result = verifyProposalsDb({
		workspaceRoot: root,
		proposalsDirAbs: proposals,
		sourceCommit: 'verify-sha',
	});
	expect(result.digestBefore).toBeNull();
	expect(result.digestAfter).toMatch(/^[a-f0-9]{64}$/);
	expect(result.match).toBe(false);
});
