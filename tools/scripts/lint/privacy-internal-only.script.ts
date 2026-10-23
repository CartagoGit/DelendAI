#!/usr/bin/env bun
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const RUNTIME_ROOT = 'plugins/error-reporting/src';
const ALLOWED_RUNTIME_FILE =
	'plugins/error-reporting/src/lib/options.service.ts';
const DOC_PATHS = [
	'plugins/error-reporting/README.md',
	// d00014: the manual `docs/delendai/plugins/error-reporting.md` page
	// was folded into the auto-generated page's "## Notes" section; its
	// prose now lives at this notes source file (the one place a human
	// edits it) rather than at a second, undrift-checked page.
	'docs/delendai/plugins/notes/error-reporting.notes.md',
] as const;

export interface IPrivacyInternalOnlyLintResult {
	readonly ok: boolean;
	readonly runtimeViolations: readonly string[];
	readonly docViolations: readonly string[];
}

const collectFiles = async (dirAbs: string): Promise<readonly string[]> => {
	const entries = await readdir(dirAbs, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const child = join(dirAbs, entry.name);
			if (entry.isDirectory()) return collectFiles(child);
			return [child];
		}),
	);
	return nested.flat();
};

const linesWithInternalOnly = (text: string): readonly number[] =>
	text
		.split('\n')
		.map((line, index) => ({ line, index: index + 1 }))
		.filter((entry) => entry.line.includes('internalOnly'))
		.map((entry) => entry.index);

const isAllowedDocLine = (line: string): boolean => {
	const normalized = line.toLowerCase();
	return (
		normalized.includes('removed') ||
		normalized.includes('deprecated') ||
		normalized.includes('legacy')
	);
};

export const lintPrivacyInternalOnly = (input: {
	readonly files: Readonly<Record<string, string>>;
}): IPrivacyInternalOnlyLintResult => {
	const runtimeViolations: string[] = [];
	const docViolations: string[] = [];
	for (const [path, text] of Object.entries(input.files)) {
		const rel = path.replaceAll('\\', '/');
		const matches = linesWithInternalOnly(text);
		if (matches.length === 0) continue;
		if (rel.startsWith(RUNTIME_ROOT)) {
			if (rel !== ALLOWED_RUNTIME_FILE) {
				runtimeViolations.push(
					`${rel}:${matches.join(',')}: runtime must not reference internalOnly`,
				);
			}
			continue;
		}
		if (DOC_PATHS.includes(rel as (typeof DOC_PATHS)[number])) {
			const lines = text.split('\n');
			for (const lineNumber of matches) {
				const line = lines[lineNumber - 1] ?? '';
				if (!isAllowedDocLine(line)) {
					docViolations.push(
						`${rel}:${lineNumber}: docs may mention internalOnly only as removed/deprecated legacy surface`,
					);
				}
			}
		}
	}
	return {
		ok: runtimeViolations.length === 0 && docViolations.length === 0,
		runtimeViolations,
		docViolations,
	};
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	void (async () => {
		const root = repoRoot();
		const runtimeFiles = await collectFiles(join(root, RUNTIME_ROOT));
		const targetFiles = [
			...runtimeFiles,
			...DOC_PATHS.map((path) => join(root, path)),
		];
		const contents = await Promise.all(
			targetFiles.map(async (fileAbs) => {
				const rel = relative(root, fileAbs).replaceAll('\\', '/');
				return [rel, await readFile(fileAbs, 'utf8')] as const;
			}),
		);
		const result = lintPrivacyInternalOnly({
			files: Object.fromEntries(contents),
		});
		if (!result.ok) {
			for (const violation of [
				...result.runtimeViolations,
				...result.docViolations,
			]) {
				console.error(`✖ privacy-internal-only: ${violation}`);
			}
			process.exit(1);
		}
		console.log(
			'✓ privacy-internal-only: runtime and docs keep internalOnly only as deprecated compatibility.',
		);
	})();
}
