import { readFile } from 'node:fs/promises';
import { relative, sep } from 'node:path';

import { walkAllowedFiles } from '@mcp-vertex/core/public';

/**
 * Pure engine for `rename_audit`: scan tracked source files for identifiers
 * that survived a rename. mcp-vertex went through several (`@mcp-server` →
 * `mcp-core` → `@mcp-vertex`, `mcpcore_`/`mcpvertex_` → `mcp-vertex_`) and
 * each time the only way to confirm nothing was left behind was a manual
 * `grep` across the tree. This gives that check a real tool surface.
 */
export interface IRenamePattern {
	readonly name: string;
	readonly pattern: RegExp;
}

export interface IRenameFinding {
	readonly pattern: string;
	readonly file: string;
	readonly line: number;
	readonly snippet: string;
}

export interface IRenameAuditOptions {
	readonly workspaceRootAbs: string;
	readonly patterns?: readonly IRenamePattern[];
	readonly extensions?: readonly string[];
	readonly ignoreDirs?: readonly string[];
	readonly maxResults?: number;
}

/** Names retired by past mcp-vertex renames. Extend as new renames land. */
export const DEFAULT_RETIRED_PATTERNS: readonly IRenamePattern[] = [
	{ name: '@mcp-server', pattern: /@mcp-server\b/g },
	{ name: 'mcp-core', pattern: /\bmcp-core\b/g },
	{ name: 'mcpcore_', pattern: /\bmcpcore_/g },
	{ name: 'mcpvertex_ (no hyphen)', pattern: /\bmcpvertex_/g },
];

// Markdown is deliberately excluded: audits/CHANGELOG legitimately keep
// historical mentions of retired names on the record forever, so they would
// be permanent, expected noise rather than a missed rename.
const DEFAULT_EXTENSIONS: readonly string[] = [
	'ts',
	'tsx',
	'astro',
	'json',
	'scss',
];
const DEFAULT_IGNORE_DIRS: readonly string[] = [
	'node_modules',
	'.git',
	'dist',
	'build',
	'coverage',
	'.cache',
	'.mcp-vertex',
];

const extOf = (name: string): string => {
	const dot = name.lastIndexOf('.');
	return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

/**
 * Scan every allowed file under `workspaceRootAbs` for the given (or
 * default retired) patterns and return one finding per matching line.
 * Read-only — never touches the files it scans.
 */
export const auditRetiredReferences = async (
	options: IRenameAuditOptions,
): Promise<readonly IRenameFinding[]> => {
	const patterns = options.patterns ?? DEFAULT_RETIRED_PATTERNS;
	const extensions = new Set(options.extensions ?? DEFAULT_EXTENSIONS);
	const ignoreDirs = new Set(options.ignoreDirs ?? DEFAULT_IGNORE_DIRS);
	const maxResults = options.maxResults ?? 200;
	const findings: IRenameFinding[] = [];
	let truncated = false;

	await walkAllowedFiles({
		workspaceRootAbs: options.workspaceRootAbs,
		rootAbs: options.workspaceRootAbs,
		isTruncated: () => truncated,
		shouldSkipDir: (_relDirPath, dirName) => ignoreDirs.has(dirName),
		visitFile: async (absPath) => {
			if (truncated || !extensions.has(extOf(absPath))) return;
			const raw = await readFile(absPath, 'utf8').catch(() => undefined);
			if (raw === undefined) return;
			const relPath = relative(options.workspaceRootAbs, absPath)
				.split(sep)
				.join('/');
			const lines = raw.split('\n');
			for (let i = 0; i < lines.length; i += 1) {
				if (truncated) return;
				const line = lines[i] ?? '';
				for (const { name, pattern } of patterns) {
					pattern.lastIndex = 0;
					if (pattern.test(line)) {
						findings.push({
							pattern: name,
							file: relPath,
							line: i + 1,
							snippet: line.trim().slice(0, 200),
						});
						if (findings.length >= maxResults) truncated = true;
					}
					pattern.lastIndex = 0;
				}
			}
		},
	});

	return findings;
};
