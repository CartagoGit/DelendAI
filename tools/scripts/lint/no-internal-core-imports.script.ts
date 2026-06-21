#!/usr/bin/env bun
/**
 * no-internal-core-imports.script.ts - f00034 s7 (gate).
 *
 * The CLI package may depend on the public core API only. Imports from
 * `@mcp-vertex/core/lib`, `@mcp-vertex/core/dist`, or relative paths into
 * `packages/core/src/lib` couple the CLI to core internals and must fail.
 */
import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const DEFAULT_SCAN_ROOT = 'packages/cli/src';
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

export const detectInternalCoreImports = async (
	root: string = DEFAULT_SCAN_ROOT,
): Promise<readonly IInternalCoreImportFinding[]> => {
	const absRoot = isAbsolute(root) ? root : join(REPO_ROOT, root);
	const findings: IInternalCoreImportFinding[] = [];
	for (const file of await walk(absRoot)) {
		const content = await readFile(file, 'utf8').catch(() => '');
		if (content.length === 0) continue;
		findings.push(...scanText(content, file, relative(REPO_ROOT, file)));
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
