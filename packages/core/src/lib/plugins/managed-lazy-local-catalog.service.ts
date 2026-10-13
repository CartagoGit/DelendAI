/**
 * managed-lazy-local-catalog.service.ts — a project's own plugins load
 * lazily too, after the first start that saw them.
 *
 * The lazy surface routes every tool through a catalog generated in
 * delendai's repository, which cannot list a plugin a project ships
 * itself. One such plugin made the whole surface eager at every start,
 * and the notice told the project to run a script only delendai has.
 * Now the start that has to load eagerly records what that plugin
 * registered, in the project's cache, with the state of its file; the
 * next start finds it there and loads every plugin lazily. When the
 * plugin's file changes, its record no longer matches and one eager
 * start records it again.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
	ILocalLazyCatalogFile,
	ILocalLazyCatalogRecord,
} from '../contracts/interfaces/managed-lazy-local-catalog.interface';
import type { ILoadedPlugin } from './load-plugins';
import { useLocalLazyEntries } from './managed-lazy-catalog-lookup';

/** The file, under the project's cache directory, the records live in. */
export const localLazyCatalogPath = (
	workspaceRoot: string,
	cacheDir: string,
): string => join(workspaceRoot, cacheDir, 'managed-lazy-local.json');

const filePathOf = (resolved: string): string =>
	resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved;

const fingerprintOf = async (
	resolved: string,
): Promise<ILocalLazyCatalogRecord['fingerprint'] | undefined> => {
	try {
		const info = await stat(filePathOf(resolved));
		return { size: info.size, mtimeMs: Math.trunc(info.mtimeMs) };
	} catch {
		return undefined;
	}
};

const readRecords = async (
	path: string,
): Promise<readonly ILocalLazyCatalogRecord[]> => {
	try {
		const parsed = JSON.parse(
			await readFile(path, 'utf8'),
		) as Partial<ILocalLazyCatalogFile>;
		return parsed.version === 1 && Array.isArray(parsed.records)
			? parsed.records
			: [];
	} catch {
		return [];
	}
};

/**
 * Puts this project's recorded plugins into the lazy lookup, the ones
 * whose file is still as it was recorded. Returns the specifiers used.
 */
const currentRecords = async (
	path: string,
): Promise<readonly ILocalLazyCatalogRecord[]> => {
	const current: ILocalLazyCatalogRecord[] = [];
	for (const record of await readRecords(path)) {
		const now = await fingerprintOf(record.resolved);
		if (
			now !== undefined &&
			now.size === record.fingerprint.size &&
			now.mtimeMs === record.fingerprint.mtimeMs
		)
			current.push(record);
	}
	return current;
};

export const useLocalLazyCatalog = async (
	path: string,
): Promise<readonly string[]> => {
	const current = await currentRecords(path);
	useLocalLazyEntries(current);
	return current.map((record) => record.specifier);
};

/** What a loaded plugin registered, as the lazy runtime needs it. */
export const localLazyRecordOf = async (
	loaded: ILoadedPlugin,
): Promise<ILocalLazyCatalogRecord | undefined> => {
	const fingerprint = (await fingerprintOf(loaded.resolved)) ?? {
		size: -1,
		mtimeMs: -1,
	};
	const registrations = loaded.registrations;
	const observes =
		registrations.onToolStart !== undefined ||
		registrations.onToolCall !== undefined ||
		registrations.onToolCancel !== undefined ||
		registrations.logsSink !== undefined;
	return {
		specifier: loaded.specifier,
		resolved: loaded.resolved,
		fingerprint,
		entry: {
			id: loaded.plugin.name,
			packageSpecifier: loaded.resolved,
			toolIds: (registrations.tools ?? []).map((tool) => tool.id),
			promptIds: (registrations.prompts ?? []).map((prompt) => prompt.id),
			resourceIds: (registrations.resources ?? []).map(
				(resource) => resource.id,
			),
			knowledgeIds: (registrations.knowledge ?? []).map(
				(entry) => entry.id,
			),
			skillIds: (registrations.skills ?? []).map((skill) => skill.id),
			dependencies: loaded.plugin.dependsOn ?? [],
			...(loaded.plugin.describe === undefined
				? {}
				: { summary: loaded.plugin.describe }),
			...(observes ? { startupActivation: true } : {}),
		},
	};
};

/**
 * Serves the loaded plugins the catalog did not index from this start on,
 * and records the ones whose file can be fingerprinted. Returns the
 * specifiers now served.
 */
export const recordLocalLazyCatalog = async (
	path: string,
	loaded: readonly ILoadedPlugin[],
	unindexed: readonly string[],
): Promise<readonly string[]> => {
	const records = new Map(
		(await readRecords(path)).map((record) => [record.specifier, record]),
	);
	const current = await currentRecords(path);
	const discovered: ILocalLazyCatalogRecord[] = [];
	let persist = false;
	for (const plugin of loaded.filter((entry) =>
		unindexed.includes(entry.specifier),
	)) {
		const record = await localLazyRecordOf(plugin);
		if (record === undefined) continue;
		discovered.push(record);
		// A plugin with no file to fingerprint (a package, a module served
		// from memory) is served now and discovered again next start.
		if (record.fingerprint.size < 0) continue;
		records.set(record.specifier, record);
		persist = true;
	}
	useLocalLazyEntries([
		...current.filter(
			(kept) =>
				!discovered.some(
					(record) => record.specifier === kept.specifier,
				),
		),
		...discovered,
	]);
	if (persist)
		try {
			await mkdir(dirname(path), { recursive: true });
			const file: ILocalLazyCatalogFile = {
				version: 1,
				records: [...records.values()],
			};
			await writeFile(path, `${JSON.stringify(file, null, '\t')}\n`);
		} catch {
			// Served from memory this start; recorded again next time.
		}
	return discovered.map((record) => record.specifier);
};
