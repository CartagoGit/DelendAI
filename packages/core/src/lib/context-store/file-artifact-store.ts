/**
 * file-artifact-store.ts — an `IArtifactStore` kept on disk, one file per
 * key, so what context-compiler builds outlives the process that built it.
 *
 * The store was an interface with no implementation outside specs: the
 * compiler that turns a task into a manifest of references could not run
 * anywhere. Each record is written whole to a temporary file and renamed
 * into place, so a reader never sees half of one.
 */
import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import {
	canonicalStateHash,
	sha256Hex,
	type CanonicalJsonValue,
	type IArtifactKey,
	type IArtifactRecord,
	type IArtifactStore,
	type StateScope,
} from '@delendai/state';

const scopeDir = (root: string, scope: StateScope): string =>
	join(root, canonicalStateHash(scope as unknown as CanonicalJsonValue));

const fileOf = (root: string, key: IArtifactKey): string =>
	join(scopeDir(root, key.scope), key.kind, `${sha256Hex(key.id)}.json`);

const readRecord = async <T>(
	path: string,
): Promise<IArtifactRecord<T> | null> => {
	try {
		return JSON.parse(await readFile(path, 'utf8')) as IArtifactRecord<T>;
	} catch {
		return null;
	}
};

/** A store under `root`, timestamped by `now`. */
export const createFileArtifactStore = (input: {
	readonly root: string;
	readonly now?: () => number;
	readonly reconciledCommitSha?: string;
}): IArtifactStore => {
	const now = input.now ?? Date.now;
	return {
		async put<T>(key: IArtifactKey, value: T): Promise<IArtifactRecord<T>> {
			const path = fileOf(input.root, key);
			const before = await readRecord<T>(path);
			const at = now();
			const record: IArtifactRecord<T> = {
				key,
				value,
				contentHash: canonicalStateHash(
					value as unknown as CanonicalJsonValue,
				),
				createdAt: before?.createdAt ?? at,
				updatedAt: at,
				reconciledCommitSha: input.reconciledCommitSha ?? '',
			};
			await mkdir(join(scopeDir(input.root, key.scope), key.kind), {
				recursive: true,
			});
			const temporary = `${path}.${String(process.pid)}.tmp`;
			await writeFile(temporary, JSON.stringify(record));
			await rename(temporary, path);
			return record;
		},
		get: <T>(key: IArtifactKey) => readRecord<T>(fileOf(input.root, key)),
		async delete(key: IArtifactKey): Promise<void> {
			await rm(fileOf(input.root, key), { force: true });
		},
		async list(
			scope: StateScope,
			kind?: IArtifactKey['kind'],
		): Promise<readonly IArtifactKey[]> {
			const base = scopeDir(input.root, scope);
			let kinds: string[];
			try {
				kinds = kind === undefined ? await readdir(base) : [kind];
			} catch {
				return [];
			}
			const keys: IArtifactKey[] = [];
			for (const each of kinds) {
				let names: string[];
				try {
					names = await readdir(join(base, each));
				} catch {
					continue;
				}
				for (const name of names.filter((file) =>
					file.endsWith('.json'),
				)) {
					const record = await readRecord(join(base, each, name));
					if (record !== null) keys.push(record.key);
				}
			}
			return keys;
		},
	};
};
