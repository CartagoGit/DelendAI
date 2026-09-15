/**
 * declared-branches.spec.ts — the branches come from the policy, not
 * from literals in whichever script needs them.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { declaredBranches } from './declared-branches';
import { repoRoot } from './repo-root';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const workspaceWith = (config: unknown): string => {
	const root = mkdtempSync(join(tmpdir(), 'declared-branches-'));
	roots.push(root);
	writeFileSync(join(root, 'delendai.config.json'), JSON.stringify(config));
	return root;
};

describe('declaredBranches', () => {
	it('reads this repository’s integration and release branches', () => {
		const branches = declaredBranches(repoRoot());

		expect(branches.integration).toBe('develop');
		expect(branches.release).toBe('main');
	});

	it('resolves a workspace with no development block to the policy defaults', () => {
		const branches = declaredBranches(workspaceWith({}));

		expect(typeof branches.integration).toBe('string');
		expect(branches.integration).not.toBe('');
	});
});
