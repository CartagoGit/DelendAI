import { describe, expect, it } from 'vitest';

import type {
	IImportGraphStore,
	IStoredImportGraph,
} from '@delendai/core/lib/contracts/interfaces/import-graph.interface';
import {
	importGraphFor,
	reviveImportGraph,
	storedImportGraph,
} from '@delendai/core/lib/import-graph/import-graph-cache.service';
import {
	affectedFiles,
	affectedFilesIn,
	buildImportGraph,
	runsCodeWhenLoaded,
} from '@delendai/core/lib/import-graph/import-graph.service';
import { taskReachIn } from '@delendai/core/lib/import-graph/task-reach.service';

const REPO: Readonly<Record<string, string>> = {
	'p/a.ts': 'export const a = 1;\n',
	'p/b.ts': "import { a } from './a';\nexport const b = a + 1;\n",
	'p/c.ts': 'export const c = 3;\n',
	'p/loud.ts': "export const loud = 4;\nregister('x');\n",
	'p/index.ts': "export { a } from './a';\nexport { c } from './c';\n",
	'p/use-loud.ts': "import { loud } from './loud';\nexport const u = loud;\n",
	'p/a.spec.ts': "import { a } from './index';\n",
	'p/c.spec.ts': "import { c } from './index';\n",
};
const input = {
	files: Object.keys(REPO),
	paths: {},
	read: (file: string): string => REPO[file] ?? '',
};

const memoryStore = (): IImportGraphStore & {
	readonly kept: Map<string, IStoredImportGraph>;
} => {
	const kept = new Map<string, IStoredImportGraph>();
	return {
		kept,
		load: async (key) => kept.get(key),
		save: async (key, graph) => void kept.set(key, graph),
	};
};

describe('the import graph', () => {
	it('[<200ms] follows a name through a barrel to its declaring module', () => {
		expect(affectedFiles({ ...input, changed: ['p/c.ts'] })).toEqual([
			'p/c.spec.ts',
			'p/c.ts',
		]);
	});

	it('[<200ms] follows a module that runs code on load by file', () => {
		expect(affectedFiles({ ...input, changed: ['p/loud.ts'] })).toContain(
			'p/use-loud.ts',
		);
		expect(runsCodeWhenLoaded(REPO['p/loud.ts'] ?? '')).toBe(true);
	});

	it('[<20ms] stops at the importer steps asked for', () => {
		const graph = buildImportGraph(input);
		const changed = ['p/a.ts'];
		const read = input.read;
		expect(affectedFilesIn(graph, { changed, read }, 1)).toEqual([
			'p/a.spec.ts',
			'p/a.ts',
			'p/b.ts',
		]);
	});

	it('[<20ms] ignores a changed file the graph does not know', () => {
		expect(affectedFiles({ ...input, changed: ['new.ts'] })).toEqual([]);
	});
});

describe('the kept import graph', () => {
	it('[<200ms] survives storage unchanged', () => {
		const graph = buildImportGraph(input);
		const back = reviveImportGraph(
			JSON.parse(JSON.stringify(storedImportGraph(graph))),
		);
		const read = input.read;
		const changed = ['p/a.ts'];
		expect(affectedFilesIn(back, { changed, read })).toEqual(
			affectedFilesIn(graph, { changed, read }),
		);
	});

	it('[<20ms] is built once per tree and read after', async () => {
		const store = memoryStore();
		let reads = 0;
		const counted = {
			...input,
			read: (file: string) => {
				reads += 1;
				return input.read(file);
			},
		};
		await importGraphFor(() => counted, 'tree-1', store);
		const built = reads;
		await importGraphFor(() => counted, 'tree-1', store);
		expect(built).toBeGreaterThan(0);
		expect(reads).toBe(built);
		await importGraphFor(() => counted, 'tree-2', store);
		expect(reads).toBe(built * 2);
	});

	it('[<200ms] is not kept without a tree id', async () => {
		const store = memoryStore();
		await importGraphFor(() => input, undefined, store);
		expect(store.kept.size).toBe(0);
	});
});

describe('the task reach', () => {
	it('[<20ms] names consumers and specs, not the task files', () => {
		const graph = buildImportGraph(input);
		expect(taskReachIn(graph, ['p/a.ts'], input.read)).toEqual({
			consumers: ['p/b.ts'],
			specs: ['p/a.spec.ts'],
		});
	});
});
