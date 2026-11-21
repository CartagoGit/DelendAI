import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { declaredPathExists } from './declared-path-exists.lib';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const tree = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'declared-path-'));
	roots.push(root);
	mkdirSync(join(root, 'docs/delendai/proposals/review'), {
		recursive: true,
	});
	mkdirSync(join(root, 'src'), { recursive: true });
	writeFileSync(
		join(root, 'docs/delendai/proposals/review/x00001-a.md'),
		'#\n',
	);
	writeFileSync(join(root, 'src/a.ts'), '\n');
	return root;
};

describe('declaredPathExists', () => {
	it('finds a file where it is declared', () => {
		expect(declaredPathExists(tree(), 'src/a.ts')).toBe(true);
	});

	it('finds a proposal in whichever folder its status put it', () => {
		expect(
			declaredPathExists(
				tree(),
				'docs/delendai/proposals/in-progress/x00001-a.md',
			),
		).toBe(true);
	});

	it('finds neither a missing file nor a proposal that is nowhere', () => {
		const root = tree();
		expect(declaredPathExists(root, 'src/b.ts')).toBe(false);
		expect(
			declaredPathExists(
				root,
				'docs/delendai/proposals/done/x00002-b.md',
			),
		).toBe(false);
	});
});
