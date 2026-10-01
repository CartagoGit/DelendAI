/**
 * real-modules.ts — f00132 S1: production I/O adapter for the module
 * graph builder. Walks the package's src files, parses the
 * "import ... from ..." lines, and returns the relative paths that
 * resolve to OTHER package files. External imports (those without a
 * matching file under the package) are dropped.
 *
 * The implementation deliberately does NOT use a real TypeScript
 * parser: a regex over the "from ..." form is enough for the
 * "import" / "export ... from" shapes the delendai codebase uses,
 * and it keeps the I/O layer dependency-free.
 */

import { dirname, join, relative, resolve } from 'node:path';

import { SafeWorkspaceReader, safeListDir } from '@delendai/core/public';

import type { IDiagramModuleDeps } from '../contracts/interfaces/graph.interface';

/** A single static import / re-export clause (regex shape). */
const IMPORT_RE =
	/(?:^|\n)\s*(?:import|export)\s+(?:[^'";]*?from\s+)?['"]([^'"]+)['"]/g;

/**
 * Recursively list every .ts file under dirAbs, returning paths
 * relative to rootAbs. The result is sorted (mtime would be
 * unstable) so the builder is fully deterministic.
 */
const listTsFiles = async (rootAbs: string): Promise<readonly string[]> => {
	const out: string[] = [];
	const walk = async (dirAbs: string): Promise<void> => {
		const entries = (await safeListDir(dirAbs)).entries;
		for (const entry of entries) {
			const abs = join(dirAbs, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === 'node_modules' || entry.name === 'dist')
					continue;
				await walk(abs);
				continue;
			}
			if (!entry.isFile()) continue;
			if (!/\.tsx?$/.test(entry.name)) continue;
			out.push(relative(rootAbs, abs));
		}
	};
	await walk(rootAbs);
	return out.sort();
};

/**
 * Resolve a "from ..." path to a path RELATIVE to rootAbs, or
 * undefined if the import is external (not under the package). The
 * I/O layer does the file-presence check; the builder only consumes
 * the resolved set.
 */
const resolveImport = async (
	importPath: string,
	fromFile: string,
	rootAbs: string,
): Promise<string | undefined> => {
	// Relative import ("./foo" or "../foo") — the only kind the
	// package-internal graph cares about. Anything else is external.
	if (!importPath.startsWith('.')) return undefined;
	const fromAbs = join(rootAbs, fromFile);
	const importedAbs = resolve(dirname(fromAbs), importPath);
	// Accept either foo.ts or foo/index.ts to mirror TS
	// module resolution. We only check existence here.
	const candidates = [
		importedAbs,
		`${importedAbs}.ts`,
		`${importedAbs}.tsx`,
		join(importedAbs, 'index.ts'),
		join(importedAbs, 'index.tsx'),
	];
	for (const candidate of candidates) {
		try {
			const rel = relative(rootAbs, candidate);
			if (!rel.startsWith('..')) return rel;
		} catch {
			// ignore — try next candidate
		}
	}
	return undefined;
};

/**
 * Production IDiagramModuleDeps rooted at packageRootAbs (the
 * directory that contains the package's package.json).
 */
export const realDiagramModules = (
	packageRootAbs: string,
): IDiagramModuleDeps => {
	const allFilesPromise = listTsFiles(packageRootAbs);
	const reader = new SafeWorkspaceReader(packageRootAbs);
	return {
		listPackageFiles: async () => allFilesPromise,
		readFileImports: async (relativePath) => {
			const allFiles = await allFilesPromise;
			const allSet = new Set(allFiles);
			let raw: string;
			try {
				raw = (await reader.readText(relativePath)).content;
			} catch {
				return [];
			}
			const out: string[] = [];
			// Reset the regex state for each file (the g flag carries
			// lastIndex across calls otherwise).
			IMPORT_RE.lastIndex = 0;
			let match: RegExpExecArray | null = IMPORT_RE.exec(raw);
			while (match !== null) {
				const importPath = match[1];
				if (importPath === undefined) {
					match = IMPORT_RE.exec(raw);
					continue;
				}
				const resolved = await resolveImport(
					importPath,
					relativePath,
					packageRootAbs,
				);
				if (resolved === undefined) {
					match = IMPORT_RE.exec(raw);
					continue;
				}
				if (!allSet.has(resolved)) {
					match = IMPORT_RE.exec(raw);
					continue;
				}
				out.push(resolved);
				// Advance the regex to the next match on every successful
				// iteration — without this, the loop re-processes the same
				// `match` on every `while` check and the function never
				// returns. Diagnosed by f00030-protect-diagram-modules.
				match = IMPORT_RE.exec(raw);
			}
			return out;
		},
	};
};
