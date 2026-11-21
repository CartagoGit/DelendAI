import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { repositoryTaskReach } from '@delendai/core/lib/work-units/task-briefing.service';
import {
	fileImportGraphStore,
	readSources,
	repositoryImportGraph,
	storedImportGraph,
} from '@delendai/core/lib/import-graph/import-graph-cache.service';
import { buildImportGraph } from '@delendai/core/lib/import-graph/import-graph.service';

const roots: string[] = [];
const temp = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'import-graph-'));
	roots.push(dir);
	return dir;
};
afterEach(() => {
	for (const dir of roots.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

const stored = storedImportGraph(
	buildImportGraph({
		files: ['a.ts', 'b.ts'],
		paths: {},
		read: (file) =>
			file === 'b.ts'
				? "import { a } from './a';"
				: 'export const a = 1;',
	}),
);

const repository = (): string => {
	const root = temp();
	const git = (...args: string[]): void => {
		execFileSync('git', args, { cwd: root, stdio: 'ignore' });
	};
	git('init', '-q');
	writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
	writeFileSync(
		join(root, 'b.ts'),
		"import { a } from './a';\nexport const b = a;\n",
	);
	writeFileSync(join(root, 'a.spec.ts'), "import { a } from './a';\n");
	git('add', '.');
	git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'x');
	return root;
};

describe('the import graph store', () => {
	it('[<500ms] returns what it saved and nothing for a stranger', async () => {
		const store = fileImportGraphStore(join(temp(), 'kept'));
		expect(await store.load('t1')).toBeUndefined();
		await store.save('t1', stored);
		expect(await store.load('t1')).toEqual(stored);
	});

	it('[<500ms] keeps only the newest few trees', async () => {
		const dir = join(temp(), 'kept');
		const store = fileImportGraphStore(dir);
		for (const key of ['t1', 't2', 't3', 't4', 't5'])
			await store.save(key, stored);
		expect(
			readdirSync(dir).filter((n) => n.endsWith('.json')),
		).toHaveLength(3);
	});

	it('[<500ms] is a miss when the cache cannot be written', async () => {
		const blocker = join(temp(), 'file');
		writeFileSync(blocker, '');
		const store = fileImportGraphStore(join(blocker, 'kept'));
		await store.save('t1', stored);
		expect(await store.load('t1')).toBeUndefined();
	});

	it('[<500ms] reads sources, empty when one is gone', async () => {
		const root = temp();
		mkdirSync(join(root, 'd'));
		writeFileSync(join(root, 'd/x.ts'), 'x');
		const read = await readSources(root, ['d/x.ts', 'gone.ts']);
		expect([read('d/x.ts'), read('gone.ts')]).toEqual(['x', '']);
	});
});

describe('the repository import graph', () => {
	it('[<1000ms] reaches consumers and specs, and is kept for the tree', async () => {
		const root = repository();
		const reach = await repositoryTaskReach(root, ['a.ts']);
		expect(reach).toEqual({ consumers: ['b.ts'], specs: ['a.spec.ts'] });
		expect(existsSync(join(root, '.cache/delendai/import-graph'))).toBe(
			true,
		);
		const again = await repositoryImportGraph(root);
		expect([...again.known].sort()).toEqual(['a.spec.ts', 'a.ts', 'b.ts']);
	});

	it('[<500ms] fails outside a git repository, which the briefing absorbs', async () => {
		const root = temp();
		await expect(repositoryTaskReach(root, ['a.ts'])).rejects.toThrow();
	});
});
