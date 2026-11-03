/**
 * vscode-cache-exclude.ts — the editor never watches or searches the
 * cache.
 *
 * A worktree delendai adds or removes under the cache is about twenty
 * files, and every one of them reaches whatever watches the folder (a
 * language server, a search index). A cache is derived state: nothing in
 * it is worth an event. The project's `.vscode/settings.json` therefore
 * excludes it from `files.watcherExclude` and `search.exclude`.
 *
 * The settings file belongs to the person. A pattern is added only where
 * it is missing; a value the person set for it, true or false, stays.
 */
import { isAbsolute } from 'node:path';

import { applyJsoncEdits, type IJsoncEdit } from '../../config/jsonc-document';
import { parseJsonc } from '../../config/jsonc-document';

import {
	CACHE_EXCLUDE_SETTINGS,
	SHARED_CACHE_ROOT,
} from './vscode-cache-exclude.constant';

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

/**
 * The glob that excludes a cache directory, or `undefined` when the cache
 * lies outside the workspace and so cannot be watched by it.
 *
 * `.cache/**` when the directory is under `.cache` (the whole shared
 * cache root is derived state), the directory's own `/**` otherwise.
 */
export const cacheExcludeGlob = (cacheDir: string): string | undefined => {
	const dir = cacheDir
		.replace(/\\/gu, '/')
		.replace(/^(\.\/)+/u, '')
		.replace(/\/+$/u, '');
	if (dir.length === 0 || isAbsolute(dir) || dir.startsWith('..'))
		return undefined;
	if (dir === SHARED_CACHE_ROOT || dir.startsWith(`${SHARED_CACHE_ROOT}/`))
		return `${SHARED_CACHE_ROOT}/**`;
	return `${dir}/**`;
};

/** Where `setting` already is: the dotted key, or the nested spelling. */
const settingPath = (
	settings: Record<string, unknown>,
	setting: string,
): readonly string[] | undefined => {
	if (asRecord(settings[setting]) !== undefined) return [setting];
	const [head = '', tail = ''] = setting.split('.');
	const nested = asRecord(asRecord(settings[head])?.[tail]);
	return nested === undefined ? undefined : [head, tail];
};

/**
 * The settings text with the cache excluded, or `undefined` when there is
 * nothing to add or the text is not a settings object we may touch.
 *
 * Pure: same text, same answer. The caller owns the file.
 */
export const mergeCacheExcludes = (
	text: string,
	cacheDir: string,
): string | undefined => {
	const glob = cacheExcludeGlob(cacheDir);
	if (glob === undefined) return undefined;
	const { value, errors } = parseJsonc(text);
	if (errors.length > 0) return undefined;
	const settings = asRecord(value);
	if (settings === undefined) return undefined;
	const edits: IJsoncEdit[] = [];
	for (const setting of CACHE_EXCLUDE_SETTINGS) {
		const path = settingPath(settings, setting);
		if (path === undefined) {
			edits.push({ path: [setting], value: { [glob]: true } });
			continue;
		}
		let cursor: Record<string, unknown> | undefined = settings;
		for (const segment of path) cursor = asRecord(cursor?.[segment]);
		if (cursor !== undefined && glob in cursor) continue;
		edits.push({ path: [...path, glob], value: true });
	}
	return edits.length === 0 ? undefined : applyJsoncEdits(text, edits);
};
