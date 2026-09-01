import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(here, '../..');
const workspaceRoot = resolve(clientRoot, '../..');
const clientSrcRoot = join(clientRoot, 'src');

const CLIENT_SRC_PREFIX = 'packages/client/src/';
const CLIENT_NODE_PREFIX = 'packages/client/src/node/';
const CLIENT_TESTS_PREFIX = 'packages/client/src/tests/';
const TS_SOURCE_FILE = /\.(?:[cm]?ts|tsx)$/u;
const CORE_IMPORT_RE = /^@mcp-vertex\/core(?:\/|$)/u;

interface IBoundaryFinding {
	readonly relPath: string;
	readonly line: number;
	readonly specifier: string;
	readonly reason: 'node-import' | 'core-value-import';
}

const IMPORT_FROM_RE = /^\s*import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gmu;
const EXPORT_FROM_RE = /^\s*export\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gmu;
const BARE_IMPORT_RE = /^\s*import\s+["']([^"']+)["']/gmu;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;
const REQUIRE_RE = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu;

const normalize = (path: string): string => path.split('\\').join('/');

const lineForOffset = (text: string, offset: number): number => {
	let line = 1;
	for (let index = 0; index < offset; index += 1) {
		if (text.charCodeAt(index) === 10) line += 1;
	}
	return line;
};

const pushFinding = (
	findings: IBoundaryFinding[],
	text: string,
	relPath: string,
	specifier: string,
	offset: number,
	reason: IBoundaryFinding['reason'],
): void => {
	findings.push({
		relPath,
		line: lineForOffset(text, offset),
		specifier,
		reason,
	});
};

const allNamedBindingsAreTypeOnly = (clause: string): boolean => {
	const trimmed = clause.trim();
	if (trimmed.startsWith('type ')) return true;
	if (/^(?:typeof\s+)?\w[\w$]*\s*,/u.test(trimmed)) return false;
	if (trimmed.startsWith('* as ')) return false;
	const named = trimmed.match(/^\{([\s\S]+)\}$/u);
	if (named === null) return false;
	const specifiers = (named[1] ?? '')
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	return (
		specifiers.length > 0 &&
		specifiers.every((part) => part.startsWith('type '))
	);
};

const isTypeOnlyCoreImportClause = (clause: string): boolean => {
	const trimmed = clause.trim();
	if (trimmed.startsWith('type ')) return true;
	return allNamedBindingsAreTypeOnly(trimmed);
};

const isTypeOnlyCoreExportClause = (clause: string): boolean => {
	const trimmed = clause.trim();
	if (trimmed.startsWith('type ')) return true;
	return allNamedBindingsAreTypeOnly(trimmed.replace(/^type\s+/u, ''));
};

const shouldSkipSourceFile = (relPath: string): boolean => {
	if (!relPath.startsWith(CLIENT_SRC_PREFIX)) return true;
	if (relPath.startsWith(CLIENT_NODE_PREFIX)) return true;
	if (relPath.startsWith(CLIENT_TESTS_PREFIX)) return true;
	if (!TS_SOURCE_FILE.test(relPath)) return true;
	if (relPath.endsWith('.d.ts')) return true;
	if (relPath.endsWith('.spec.ts')) return true;
	if (relPath.endsWith('.test.ts')) return true;
	return false;
};

const scanText = (
	text: string,
	relPath: string,
): readonly IBoundaryFinding[] => {
	if (shouldSkipSourceFile(relPath)) return [];
	const findings: IBoundaryFinding[] = [];
	for (const match of text.matchAll(IMPORT_FROM_RE)) {
		const clause = match[1] ?? '';
		const specifier = match[2] ?? '';
		const offset = match.index ?? 0;
		if (specifier.startsWith('node:')) {
			pushFinding(
				findings,
				text,
				relPath,
				specifier,
				offset,
				'node-import',
			);
		}
		if (
			CORE_IMPORT_RE.test(specifier) &&
			!isTypeOnlyCoreImportClause(clause)
		) {
			pushFinding(
				findings,
				text,
				relPath,
				specifier,
				offset,
				'core-value-import',
			);
		}
	}

	for (const match of text.matchAll(EXPORT_FROM_RE)) {
		const clause = match[1] ?? '';
		const specifier = match[2] ?? '';
		const offset = match.index ?? 0;
		if (specifier.startsWith('node:')) {
			pushFinding(
				findings,
				text,
				relPath,
				specifier,
				offset,
				'node-import',
			);
		}
		if (
			CORE_IMPORT_RE.test(specifier) &&
			!isTypeOnlyCoreExportClause(clause)
		) {
			pushFinding(
				findings,
				text,
				relPath,
				specifier,
				offset,
				'core-value-import',
			);
		}
	}

	for (const match of text.matchAll(BARE_IMPORT_RE)) {
		const specifier = match[1] ?? '';
		const offset = match.index ?? 0;
		if (specifier.startsWith('node:')) {
			pushFinding(
				findings,
				text,
				relPath,
				specifier,
				offset,
				'node-import',
			);
		}
		if (CORE_IMPORT_RE.test(specifier)) {
			pushFinding(
				findings,
				text,
				relPath,
				specifier,
				offset,
				'core-value-import',
			);
		}
	}

	for (const pattern of [DYNAMIC_IMPORT_RE, REQUIRE_RE]) {
		for (const match of text.matchAll(pattern)) {
			const specifier = match[1] ?? '';
			const offset = match.index ?? 0;
			if (specifier.startsWith('node:')) {
				pushFinding(
					findings,
					text,
					relPath,
					specifier,
					offset,
					'node-import',
				);
			}
			if (CORE_IMPORT_RE.test(specifier)) {
				pushFinding(
					findings,
					text,
					relPath,
					specifier,
					offset,
					'core-value-import',
				);
			}
		}
	}

	return findings;
};

const walkClientSource = async (dir: string): Promise<readonly string[]> => {
	const out: string[] = [];
	const stack = [dir];
	while (stack.length > 0) {
		const current = stack.pop();
		if (current === undefined) break;
		const entries = await readdir(current, { withFileTypes: true }).catch(
			() => [],
		);
		for (const entry of entries) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) {
				if (
					entry.name === 'dist' ||
					entry.name === 'node_modules' ||
					entry.name === 'coverage' ||
					entry.name === 'tests'
				) {
					continue;
				}
				const relDir = normalize(relative(workspaceRoot, full));
				if (relDir === CLIENT_NODE_PREFIX.slice(0, -1)) continue;
				stack.push(full);
				continue;
			}
			out.push(full);
		}
	}
	return out;
};

const findBoundaryViolations = async (): Promise<
	readonly IBoundaryFinding[]
> => {
	const findings: IBoundaryFinding[] = [];
	for (const absPath of await walkClientSource(clientSrcRoot)) {
		const relPath = normalize(relative(workspaceRoot, absPath));
		if (shouldSkipSourceFile(relPath)) continue;
		const text = await readFile(absPath, 'utf8').catch(() => '');
		if (text.length === 0) continue;
		findings.push(...scanText(text, relPath));
	}
	return findings.sort((left, right) => {
		if (left.relPath !== right.relPath) {
			return left.relPath.localeCompare(right.relPath);
		}
		return left.line - right.line;
	});
};

const formatFindings = (findings: readonly IBoundaryFinding[]): string => {
	if (findings.length === 0) {
		return 'client-node-boundary: 0 violations.\n';
	}
	const lines: string[] = [
		`client-node-boundary: ${findings.length} violation${findings.length === 1 ? '' : 's'}.`,
		'',
	];
	for (const finding of findings) {
		const detail =
			finding.reason === 'node-import'
				? 'Runtime client code outside packages/client/src/node must not import node:* modules.'
				: 'Runtime client code outside packages/client/src/node must not import @mcp-vertex/core as a value.';
		lines.push(
			`  ${finding.relPath}:${finding.line} imports "${finding.specifier}"`,
		);
		lines.push(`    ${detail}`);
	}
	lines.push(
		'',
		'Only packages/client/src/node may depend on Node builtins or runtime core values.',
	);
	return `${lines.join('\n')}\n`;
};

describe('client/node boundary', () => {
	it('allows type-only imports from core', () => {
		expect(
			scanText(
				[
					'import type { IToolDescriptor } from "@mcp-vertex/core/public";',
					'export type { ICallToolResult } from "@mcp-vertex/core/contracts";',
				].join('\n'),
				'packages/client/src/lib/contracts/ok.ts',
			),
		).toEqual([]);
	});

	it('flags runtime core value imports outside client/node', () => {
		const findings = scanText(
			'import { createFileSystemBatchWriter } from "@mcp-vertex/core/public";\n',
			'packages/client/src/lib/scaffold/write-scaffolded-files.ts',
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.reason).toBe('core-value-import');
	});

	it('flags node builtin imports outside client/node', () => {
		const findings = scanText(
			'import { readFile } from "node:fs/promises";\n',
			'packages/client/src/lib/scaffold/project-plugins.ts',
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.reason).toBe('node-import');
	});

	it('ignores imports under client/node', () => {
		expect(
			scanText(
				[
					'import { readFile } from "node:fs/promises";',
					'import { createFileSystemBatchWriter } from "@mcp-vertex/core/public";',
				].join('\n'),
				'packages/client/src/node/scaffold/write-scaffolded-files.ts',
			),
		).toEqual([]);
	});

	it('allows lib wrappers that re-export node implementations', () => {
		expect(
			scanText(
				'export { writeScaffoldedFiles } from "../../node/scaffold/write-scaffolded-files";\n',
				'packages/client/src/lib/scaffold/write-scaffolded-files.ts',
			),
		).toEqual([]);
	});

	it('keeps runtime client source outside client/node free of node/core value imports', async () => {
		const findings = await findBoundaryViolations();
		if (findings.length > 0) {
			throw new Error(formatFindings(findings));
		}
		expect(findings).toEqual([]);
	});
});
