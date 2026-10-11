/**
 * path-importers.ts — the files that import a changed file by its path.
 *
 * The workspace graph follows package names. A spec in one workspace that
 * imports a script of another by a relative path (`../../../tools/scripts/…`)
 * is on no edge of it, so a change to that script selected the script's own
 * zone and left the importing spec unrun. On 2026-10-09 a lint under
 * `tools/` changed its diff range, its spec in the proposals zone was not
 * selected, the pull request went green and the integration branch red.
 * Thirty-four files import across workspaces this way.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

const SOURCE = /\.(?:[cm]?[jt]sx?)$/u;
const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/gu;

const withoutExtension = (path: string): string => path.replace(SOURCE, '');

/** Whether `source`, the text of `importer`, imports any of `changed` by path. */
export const importsByPath = (
	importer: string,
	source: string,
	changed: ReadonlySet<string>,
): boolean => {
	const targets = new Set([...changed].map(withoutExtension));
	for (const match of source.matchAll(RELATIVE_IMPORT)) {
		const resolved = posix.normalize(
			posix.join(posix.dirname(importer), match[1] ?? ''),
		);
		if (targets.has(withoutExtension(resolved))) return true;
	}
	return false;
};

/**
 * Tracked source files that import one of `paths` by a relative path.
 * `git grep` narrows the candidates by file name; each is then resolved.
 */
export const pathImportersOf = (
	rootDir: string,
	paths: readonly string[],
): readonly string[] => {
	const changed = new Set(paths.filter((path) => SOURCE.test(path)));
	if (changed.size === 0) return [];
	const names = [
		...new Set(
			[...changed].map((path) => withoutExtension(posix.basename(path))),
		),
	];
	let candidates: readonly string[];
	try {
		candidates = execFileSync(
			'git',
			[
				'grep',
				'-l',
				'-F',
				...names.flatMap((name) => [
					'-e',
					`/${name}'`,
					'-e',
					`/${name}.ts'`,
				]),
				'--',
				'*.ts',
				'*.tsx',
				'*.mts',
			],
			{ cwd: rootDir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
		)
			.split('\n')
			.filter((line) => line.length > 0);
	} catch {
		// `git grep` exits 1 when nothing matches.
		return [];
	}
	return candidates.filter((candidate) => {
		if (changed.has(candidate)) return false;
		try {
			return importsByPath(
				candidate,
				readFileSync(posix.join(rootDir, candidate), 'utf8'),
				changed,
			);
		} catch {
			return false;
		}
	});
};
