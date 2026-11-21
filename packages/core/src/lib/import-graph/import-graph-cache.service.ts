/**
 * import-graph-cache.service.ts — the import graph, kept per git tree.
 *
 * Parsing every tracked file costs seconds, and the graph does not depend on
 * what changed, only on the tree it was built from: the tree id of HEAD names
 * it. The cache lives with the repository's shared `.cache/delendai`, so every
 * worktree of one repository reads what another built.
 */
import { execFileSync } from 'node:child_process';
import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { IMPORT_GRAPH_KEEP } from '../contracts/constants/import-graph.constant';
import { DEFAULT_CACHE_DIR } from '../contracts/constants/delendai-records.constant';
import type {
	IImportEdges,
	IImportGraph,
	IImportGraphInput,
	IImportGraphStore,
	IStoredImportGraph,
} from '../contracts/interfaces/import-graph.interface';
import { buildImportGraph } from './import-graph.service';

const stored = (edges: IImportEdges): Record<string, string[]> =>
	Object.fromEntries(
		[...edges].map(([file, users]) => [file, [...users].sort()]),
	);

const revived = (edges: IStoredImportGraph['bySymbol']): IImportEdges =>
	new Map(
		Object.entries(edges).map(([file, users]) => [file, new Set(users)]),
	);

export const storedImportGraph = (graph: IImportGraph): IStoredImportGraph => ({
	known: [...graph.known].sort(),
	bySymbol: stored(graph.bySymbol),
	byFile: stored(graph.byFile),
});

export const reviveImportGraph = (graph: IStoredImportGraph): IImportGraph => ({
	known: new Set(graph.known),
	bySymbol: revived(graph.bySymbol),
	byFile: revived(graph.byFile),
});

/** The graph kept under `key`, or built from `input` and kept. */
export const importGraphFor = async (
	input: () => Promise<IImportGraphInput> | IImportGraphInput,
	key: string | undefined,
	store: IImportGraphStore,
): Promise<IImportGraph> => {
	const kept = key === undefined ? undefined : await store.load(key);
	if (kept !== undefined) return reviveImportGraph(kept);
	const graph = buildImportGraph(await input());
	if (key !== undefined) await store.save(key, storedImportGraph(graph));
	return graph;
};

/** A store of JSON files in `dir`; a missing or unreadable one is a miss. */
export const fileImportGraphStore = (dir: string): IImportGraphStore => ({
	load: async (key) => {
		try {
			return JSON.parse(
				await readFile(join(dir, `${key}.json`), 'utf8'),
			) as IStoredImportGraph;
		} catch {
			return undefined;
		}
	},
	save: async (key, graph) => {
		try {
			await mkdir(dir, { recursive: true });
			const target = join(dir, `${key}.json`);
			const part = `${target}.${String(process.pid)}.part`;
			await writeFile(part, JSON.stringify(graph));
			await rename(part, target);
			const names = (await readdir(dir)).filter((name) =>
				name.endsWith('.json'),
			);
			const aged = await Promise.all(
				names.map(async (name) => ({
					name,
					at: (await stat(join(dir, name))).mtimeMs,
				})),
			);
			for (const old of aged
				.sort((a, b) => b.at - a.at)
				.slice(IMPORT_GRAPH_KEEP))
				await rm(join(dir, old.name), { force: true });
		} catch {
			// A cache that cannot be written only costs the next build.
		}
	},
});

const git = (root: string, args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 256 * 1024 * 1024,
		stdio: ['ignore', 'pipe', 'ignore'],
	}).trim();

/** The text of `files` under `root`; a file that cannot be read is empty. */
export const readSources = async (
	root: string,
	files: readonly string[],
): Promise<(file: string) => string> => {
	const text = new Map(
		await Promise.all(
			files.map(
				async (file) =>
					[
						file,
						await readFile(join(root, file), 'utf8').catch(
							() => '',
						),
					] as const,
			),
		),
	);
	return (file) => text.get(file) ?? '';
};

/** The repository's tracked TypeScript files and path aliases at `root`. */
export const repositoryGraphInput = async (
	root: string,
): Promise<IImportGraphInput> => {
	let paths: Readonly<Record<string, readonly string[]>> = {};
	try {
		paths =
			(
				JSON.parse(
					await readFile(join(root, 'tsconfig.base.json'), 'utf8'),
				) as {
					compilerOptions?: {
						paths?: Record<string, readonly string[]>;
					};
				}
			).compilerOptions?.paths ?? {};
	} catch {
		// No base tsconfig: only relative imports are followed.
	}
	const files = git(root, ['ls-files'])
		.split('\n')
		.filter((file) => /\.tsx?$/u.test(file));
	return { files, read: await readSources(root, files), paths };
};

/** The graph of the repository at `root`, kept per HEAD tree id. */
export const repositoryImportGraph = (root: string): Promise<IImportGraph> => {
	let key: string | undefined;
	let store: IImportGraphStore = {
		load: async () => undefined,
		save: async () => undefined,
	};
	try {
		key = git(root, ['rev-parse', 'HEAD^{tree}']);
		const common = git(root, ['rev-parse', '--git-common-dir']);
		store = fileImportGraphStore(
			join(
				dirname(isAbsolute(common) ? common : resolve(root, common)),
				DEFAULT_CACHE_DIR,
				'import-graph',
			),
		);
	} catch {
		key = undefined;
	}
	return importGraphFor(() => repositoryGraphInput(root), key, store);
};
