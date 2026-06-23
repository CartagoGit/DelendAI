#!/usr/bin/env bun
/**
 * no-internal-core-imports.script.ts - f00034 s7 (gate) + audit-h3-fix.
 *
 * CLI code (and any tool we ship to consumers) may depend on the public
 * core API only. Imports from `@mcp-vertex/core/lib`,
 * `@mcp-vertex/core/dist`, or relative paths into `packages/core/src/lib`
 * couple the consumer to core internals and must fail.
 *
 * Audit 2026-06-23 extended the scan roots to also cover `tools/scripts`
 * (production entrypoints + their pure-module helpers, excluding the
 * `lint/` and `metrics/` subtrees which contain self-test fixtures).
 * Internal core imports inside the core's own `tests/` tree are still
 * allowed because they live next to the code they exercise.
 */
import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
/**
 * Default scan roots (audit-h3-fix). Each entry is a workspace-relative
 * path; any directory under it is walked recursively except `node_modules`,
 * `dist`, and `coverage`. Pass a single root via the positional CLI arg
 * to narrow the scan for ad-hoc checks.
 */
const DEFAULT_SCAN_ROOTS: readonly string[] = [
	'packages/cli/src',
	'tools/scripts',
];
/**
 * Audit-h3-fix: subtrees under a scan root that legitimately touch core
 * internals on purpose. Each entry is matched as a workspace-relative
 * path prefix.
 */
const SCAN_EXCLUDE_PREFIXES: readonly string[] = [
	// The lint scripts ARE the rule: their fixture strings intentionally
	// reference `@mcp-vertex/core/lib/...` to assert the linter fires.
	'tools/scripts/lint/',
	// The metrics baseline snapshotter shells out to git, no internal
	// core imports expected; excluded defensively in case a future
	// fixture is added.
	'tools/scripts/metrics/',
];
const TS_FILE = /\.ts$/;

export interface IInternalCoreImportFinding {
	readonly absPath: string;
	readonly relPath: string;
	readonly line: number;
	readonly specifier: string;
	readonly reason: string;
}

interface IForbiddenImportPattern {
	readonly test: RegExp;
	readonly reason: string;
}

const FORBIDDEN_IMPORTS: readonly IForbiddenImportPattern[] = [
	{
		test: /^@mcp-vertex\/core\/lib(?:\/|$)/,
		reason: 'use @mcp-vertex/core/public instead of @mcp-vertex/core/lib internals',
	},
	{
		test: /^@mcp-vertex\/core\/dist(?:\/|$)/,
		reason: 'use @mcp-vertex/core/public instead of @mcp-vertex/core/dist build output',
	},
	{
		test: /(?:^|\/)packages\/core\/src\/lib(?:\/|$)/,
		reason: 'use @mcp-vertex/core/public instead of a relative path into packages/core/src/lib',
	},
	{
		test: /(?:^|\/)\.\.\/\.\.\/core\/src\/lib(?:\/|$)/,
		reason: 'use @mcp-vertex/core/public instead of ../../core/src/lib internals',
	},
];

const IMPORT_SPECIFIER =
	/\b(?:import|export)\b(?:[\s\S]*?\bfrom\s*)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\s*\(\s*["']([^"']+)["']\s*\)/g;

const lineForOffset = (text: string, offset: number): number => {
	let line = 1;
	for (let i = 0; i < offset; i += 1) {
		if (text.charCodeAt(i) === 10) line += 1;
	}
	return line;
};

const findForbiddenReason = (specifier: string): string | undefined =>
	FORBIDDEN_IMPORTS.find((pattern) => pattern.test.test(specifier))?.reason;

export const scanText = (
	text: string,
	absPath: string,
	relPath: string,
): readonly IInternalCoreImportFinding[] => {
	const findings: IInternalCoreImportFinding[] = [];
	for (const match of text.matchAll(IMPORT_SPECIFIER)) {
		const specifier = match[1] ?? match[2] ?? match[3];
		if (specifier === undefined) continue;
		const reason = findForbiddenReason(specifier);
		if (reason === undefined) continue;
		findings.push({
			absPath,
			relPath,
			line: lineForOffset(text, match.index ?? 0),
			specifier,
			reason,
		});
	}
	return findings;
};

const walk = async (root: string): Promise<readonly string[]> => {
	const out: string[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const dir = stack.pop();
		if (dir === undefined) break;
		let entries: import('node:fs').Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (
					entry.name === 'node_modules' ||
					entry.name === 'dist' ||
					entry.name === 'coverage'
				) {
					continue;
				}
				stack.push(full);
				continue;
			}
			if (entry.isFile() && TS_FILE.test(entry.name)) {
				out.push(full);
			}
		}
	}
	return out;
};

/**
 * Audit-h3-fix: accepts a single root (string) or a list of roots
 * (readonly string[]). The default list lives in DEFAULT_SCAN_ROOTS.
 */
export const detectInternalCoreImports = async (
	roots: string | readonly string[] = DEFAULT_SCAN_ROOTS,
): Promise<readonly IInternalCoreImportFinding[]> => {
	const list = typeof roots === 'string' ? [roots] : roots;
	const findings: IInternalCoreImportFinding[] = [];
	for (const root of list) {
		const absRoot = isAbsolute(root) ? root : join(REPO_ROOT, root);
		for (const file of await walk(absRoot)) {
			const rel = relative(REPO_ROOT, file);
			// Audit-h3-fix: respect SCAN_EXCLUDE_PREFIXES. The lint subtree
			// and metrics subtree are skipped wholesale — fixture strings
			// there intentionally reference internal core paths.
			if (
				SCAN_EXCLUDE_PREFIXES.some(
					(prefix) =>
						rel === prefix.replace(/\/$/, '') ||
						rel.startsWith(prefix),
				)
			) {
				continue;
			}
			const content = await readFile(file, 'utf8').catch(() => '');
			if (content.length === 0) continue;
			findings.push(...scanText(content, file, rel));
		}
	}
	return findings;
};

export const formatReport = (
	findings: readonly IInternalCoreImportFinding[],
): string => {
	if (findings.length === 0) {
		return 'no-internal-core-imports: 0 violations.\n';
	}
	const lines: string[] = [
		`no-internal-core-imports: ${findings.length} violation${findings.length === 1 ? '' : 's'}.`,
		'',
	];
	for (const finding of findings) {
		lines.push(
			`  ${finding.relPath}:${finding.line} imports "${finding.specifier}"`,
		);
		lines.push(`    ${finding.reason}`);
	}
	lines.push(
		'',
		'CLI code may import core through @mcp-vertex/core/public only.',
	);
	return `${lines.join('\n')}\n`;
};

export const main = async (): Promise<number> => {
	const findings = await detectInternalCoreImports();
	const report = formatReport(findings);
	if (findings.length === 0) {
		process.stdout.write(report);
		return 0;
	}
	process.stderr.write(report);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
