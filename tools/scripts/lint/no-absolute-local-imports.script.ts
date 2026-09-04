#!/usr/bin/env bun
/**
 * no-absolute-local-imports — forbid machine-absolute import specifiers.
 *
 * A specifier like `/home/cartago/_projects/mcp-vertex/plugins/.../foo`
 * resolves perfectly on the machine that wrote it and nowhere else. Local
 * `typecheck` therefore reports a clean tree while CI fails with
 * `TS2307: Cannot find module`, which is the worst possible split: the
 * author has no way to see the breakage, and everyone else inherits it.
 *
 * That is exactly how it reached `develop` — an agent generated a spec
 * with its own absolute path and every local gate passed.
 *
 * The rule is narrow on purpose: only POSIX-absolute (`/…`) and
 * Windows-drive (`C:\…`) specifiers are rejected. Package names, path
 * aliases (`@delendai/…`), relative paths and URL schemes
 * (`node:`, `bun:`, `https:`) are all untouched.
 *
 * Exit codes:
 *   0 — no absolute local specifier found.
 *   1 — at least one; every offender is printed with file:line.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

export interface IAbsoluteImportFinding {
	readonly file: string;
	readonly line: number;
	readonly specifier: string;
}

const SCANNED_EXTENSIONS = new Set([
	'.ts',
	'.tsx',
	'.mts',
	'.cts',
	'.js',
	'.mjs',
	'.cjs',
]);

const SKIPPED_DIRECTORIES = new Set([
	'node_modules',
	'dist',
	'build',
	'.git',
	'.cache',
	'.worktrees',
	'coverage',
]);

/**
 * A specifier is machine-absolute when it starts with `/` (POSIX) or a
 * drive letter (Windows). A URL scheme such as `node:fs` or
 * `https://esm.sh/x` never matches: the colon precedes any slash.
 */
export const isAbsoluteLocalSpecifier = (specifier: string): boolean =>
	specifier.startsWith('/') || /^[A-Za-z]:[\\/]/.test(specifier);

/**
 * Every pattern is anchored so that no quote may appear before the
 * keyword. A real import statement (including the `} from '…'` line of a
 * multi-line one) never has one; a fixture *describing* an import inside
 * a test's string literal always does. Without the anchor this lint
 * flagged its own spec.
 */
const SPECIFIER_PATTERNS: readonly RegExp[] = [
	// import … from '<spec>'   /   export … from '<spec>'   (incl. the
	// closing `} from '…'` line of a multi-line import)
	/^[^'"]*\bfrom\s*['"]([^'"]+)['"]/,
	// import '<spec>'  (side-effect import)
	/^\s*import\s*['"]([^'"]+)['"]/,
	// import('<spec>')  /  require('<spec>')
	/^[^'"]*\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/,
];

/** Pure: every absolute-local specifier in one file's text. */
export const findAbsoluteLocalImports = (
	text: string,
	relPath: string,
): readonly IAbsoluteImportFinding[] => {
	const findings: IAbsoluteImportFinding[] = [];
	const lines = text.split('\n');
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		const trimmed = line.trim();
		if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
		for (const pattern of SPECIFIER_PATTERNS) {
			const specifier = pattern.exec(line)?.[1];
			if (specifier === undefined) continue;
			if (!isAbsoluteLocalSpecifier(specifier)) continue;
			findings.push({ file: relPath, line: index + 1, specifier });
			break;
		}
	}
	return findings;
};

const collectFiles = async (directory: string): Promise<string[]> => {
	const out: string[] = [];
	const entries = await readdir(directory, { withFileTypes: true }).catch(
		() => [],
	);
	for (const entry of entries) {
		const full = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
			out.push(...(await collectFiles(full)));
			continue;
		}
		const dot = entry.name.lastIndexOf('.');
		if (dot < 0) continue;
		if (!SCANNED_EXTENSIONS.has(entry.name.slice(dot))) continue;
		out.push(full);
	}
	return out;
};

export const detectAbsoluteLocalImports = async (
	root: string = repoRoot(),
): Promise<readonly IAbsoluteImportFinding[]> => {
	const findings: IAbsoluteImportFinding[] = [];
	for (const file of await collectFiles(root)) {
		const text = await readFile(file, 'utf8').catch(() => '');
		if (text.length === 0) continue;
		findings.push(...findAbsoluteLocalImports(text, relative(root, file)));
	}
	return findings;
};

export const formatReport = (
	findings: readonly IAbsoluteImportFinding[],
): string => {
	if (findings.length === 0) {
		return '✓ no-absolute-local-imports: every import specifier is portable.\n';
	}
	return [
		`✗ no-absolute-local-imports: ${findings.length} machine-absolute specifier(s).`,
		'',
		...findings.map(
			(finding) =>
				`  ${finding.file}:${finding.line}\n    ${finding.specifier}`,
		),
		'',
		'  These resolve only on the machine that wrote them: local typecheck',
		'  passes and CI fails with TS2307. Use a relative path or a workspace',
		'  alias (`@delendai/...`) instead.',
		'',
	].join('\n');
};

const main = async (): Promise<number> => {
	const findings = await detectAbsoluteLocalImports();
	process.stdout.write(formatReport(findings));
	return findings.length === 0 ? 0 : 1;
};

if (import.meta.main) {
	process.exit(await main());
}
