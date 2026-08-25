/**
 * real-deps.ts — production I/O adapter: read every `*.json` locale file under
 * a directory. The only module here that touches the OS. Never throws (a
 * missing dir or unparseable file is skipped).
 */
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { joinUnderRoot, SafeWorkspaceReader } from '@mcp-vertex/core/public';

import type {
	II18nScanDeps,
	ILocaleFile,
	ISourceFile,
} from '../contracts/interfaces/i18n.interface';

const SOURCE_EXTENSIONS = new Set([
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.astro',
	'.md',
]);

const IGNORED_DIRS = new Set([
	'.git',
	'.idea',
	'.turbo',
	'.vscode',
	'build',
	'dist',
	'docs-api',
	'node_modules',
]);

const hasSourceExtension = (fileName: string): boolean =>
	[...SOURCE_EXTENSIONS].some((extension) => fileName.endsWith(extension));

const readSourceFiles = async (
	workspaceRootAbs: string,
	dir: string,
): Promise<readonly ISourceFile[]> => {
	const reader = new SafeWorkspaceReader(workspaceRootAbs);
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	const out: ISourceFile[] = [];
	for (const entry of entries) {
		const absolutePath = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (IGNORED_DIRS.has(entry.name)) continue;
			out.push(
				...(await readSourceFiles(workspaceRootAbs, absolutePath)),
			);
			continue;
		}
		if (!entry.isFile() || !hasSourceExtension(entry.name)) continue;
		const content = await reader
			.readText(relative(workspaceRootAbs, absolutePath))
			.then((result) => result.content)
			.catch(() => undefined);
		if (content === undefined) continue;
		out.push({
			path: relative(workspaceRootAbs, absolutePath),
			content,
		});
	}
	return out;
};

/** Production i18n deps: read `*.json` locale files from `localesDir`. */
export const realI18nDeps = (
	workspaceRootAbs: string,
	localesDir: string,
): II18nScanDeps => ({
	listLocales: async () => {
		const dir = joinUnderRoot(workspaceRootAbs, localesDir);
		const localeReader = new SafeWorkspaceReader(dir);
		const entries = await readdir(dir, { withFileTypes: true }).catch(
			() => [],
		);
		const out: ILocaleFile[] = [];
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
			try {
				const data = JSON.parse(
					(await localeReader.readText(entry.name)).content,
				) as Record<string, unknown>;
				if (data !== null && typeof data === 'object') {
					out.push({
						locale: entry.name.replace(/\.json$/, ''),
						data,
					});
				}
			} catch {
				// skip an unparseable locale file
			}
		}
		return out;
	},
	listSourceFiles: async () =>
		readSourceFiles(workspaceRootAbs, workspaceRootAbs),
});
