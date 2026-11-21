import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	INVENTORY_RULES,
	renderInventoryMarkdown,
	scanCoreProposalsBoundary,
} from '../inspect/core-proposals-boundary.script';
import { checkInventoryBoundary } from './core-proposals-boundary.script';

const INVENTORY_PATH = 'docs/delendai/CORE-PROPOSALS-BOUNDARY-INVENTORY.md';
const roots: string[] = [];

const write = async (root: string, rel: string, text: string) => {
	await mkdir(dirname(join(root, rel)), { recursive: true });
	await writeFile(join(root, rel), text, 'utf8');
};

/** A tree holding exactly the lines every open rule classifies, with its rendered inventory. */
const buildFixedTree = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'boundary-lint-'));
	roots.push(root);
	const byFile = new Map<string, string[]>();
	for (const rule of INVENTORY_RULES) {
		if (rule.resolvedBy !== undefined) continue;
		byFile.set(rule.file, [...(byFile.get(rule.file) ?? []), rule.needle]);
	}
	for (const [file, lines] of byFile) {
		await write(root, file, `${lines.join('\n')}\n`);
	}
	const result = await scanCoreProposalsBoundary(root);
	await write(root, INVENTORY_PATH, renderInventoryMarkdown(result));
	return root;
};

afterEach(async () => {
	await Promise.all(
		roots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true })),
	);
});

describe('core-proposals-boundary lint', () => {
	it('passes a tree whose lines are classified and whose inventory is current', async () => {
		const root = await buildFixedTree();
		expect(await checkInventoryBoundary(root)).toEqual([]);
	});

	it('fails an unclassified proposal-domain line naming file and line', async () => {
		const root = await buildFixedTree();
		await write(
			root,
			'packages/core/src/lib/zz-new.ts',
			"const section = 'proposals';\n",
		);
		const failures = await checkInventoryBoundary(root);
		expect(
			failures.some((f) => f.includes('zz-new.ts:1 unclassified')),
		).toBe(true);
	});

	it('fails a missing finding', async () => {
		const root = await buildFixedTree();
		const rule = INVENTORY_RULES.find(
			(entry) => entry.resolvedBy === undefined,
		);
		expect(rule).toBeDefined();
		await write(root, rule?.file ?? '', 'export {};\n');
		const failures = await checkInventoryBoundary(root);
		expect(failures.some((f) => f.includes('missing finding'))).toBe(true);
	});

	it('fails a stale committed inventory naming the regenerate command', async () => {
		const root = await buildFixedTree();
		const committed = await readFile(join(root, INVENTORY_PATH), 'utf8');
		await write(root, INVENTORY_PATH, `${committed}\nstale\n`);
		const failures = await checkInventoryBoundary(root);
		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain('is stale; regenerate it with: bun ');
	});
});
