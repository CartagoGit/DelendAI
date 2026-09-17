/**
 * The parameters of each lint an import detector reproduces.
 *
 * Every value is copied from the lint named beside it, in the same order,
 * because order decides which finding a line reports first. A parity spec
 * runs each detector against the lint's own exported finder, so a change
 * here that the lint does not share fails there rather than drifting
 * silently.
 */

/** `no-node-imports-in-{contracts,state}`: builtins, with and without `node:`. */
export const FORBIDDEN_NODE_MODULES: readonly string[] = [
	'node:fs',
	'node:path',
	'node:os',
	'node:crypto',
	'node:stream',
	'node:buffer',
	'node:child_process',
	'node:http',
	'node:https',
	'node:url',
	'node:util',
	'node:zlib',
	'node:events',
	'node:net',
	'node:tls',
	'node:dns',
	'fs',
	'path',
	'os',
	'crypto',
	'stream',
	'buffer',
	'child_process',
	'http',
	'https',
	'url',
	'util',
	'zlib',
	'events',
	'net',
	'tls',
	'dns',
];

/** `no-node-imports-in-contracts` also refuses the core runtime. */
export const CONTRACTS_FORBIDDEN_EXTRA: readonly string[] = ['@delendai/core'];

/** `no-node-imports-in-state` refuses these `@delendai/*` packages. */
export const STATE_FORBIDDEN_AT_DELENDAI: readonly string[] = [
	'@delendai/core',
	'@delendai/state-sqlite',
];

/** `no-node-imports-in-state` reads plugin state directories too. */
export const PLUGIN_STATE_DIR = /^plugins\/[^/]+\/src\/lib\/state\//u;

/** `no-core-public-types-in-client`: type imports from the runtime barrel. */
export const CLIENT_TYPE_IMPORT =
	/import\s+type\s*\{[^}]*\}\s*from\s*['"](@delendai\/core(?:\/public)?)['"]|import\s*\{[^}]*\btype\b[^}]*\}\s*from\s*['"](@delendai\/core(?:\/public)?)['"]/gu;

/** `no-internal-core-imports` (`lint:cli-imports`): every import form. */
export const INTERNAL_CORE_IMPORT_SPECIFIER =
	/\b(?:import|export)\b(?:[\s\S]*?\bfrom\s*)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\s*\(\s*["']([^"']+)["']\s*\)/gu;

/** `no-internal-core-imports`: specifiers that reach core internals. */
export const INTERNAL_CORE_FORBIDDEN: readonly RegExp[] = [
	/^@delendai\/core\/lib(?:\/|$)/u,
	/^@delendai\/core\/dist(?:\/|$)/u,
	/(?:^|\/)packages\/core\/src\/lib(?:\/|$)/u,
	/(?:^|\/)\.\.\/\.\.\/core\/src\/lib(?:\/|$)/u,
];

/** `no-internal-core-imports`: the roots it scans. */
export const INTERNAL_CORE_ROOTS: readonly string[] = [
	'packages/cli/src/',
	'tools/scripts/',
];

/** `no-internal-core-imports`: prefixes it skips inside those roots. */
export const INTERNAL_CORE_EXCLUDES: readonly string[] = [
	'tools/scripts/lint/',
	'tools/scripts/metrics/',
	'tools/scripts/test/',
];

/** `no-absolute-local-imports`: file extensions it reads. */
export const ABSOLUTE_SCANNED_EXTENSIONS: ReadonlySet<string> = new Set([
	'.ts',
	'.tsx',
	'.mts',
	'.cts',
	'.js',
	'.mjs',
	'.cjs',
]);

/** Directory names every scan skips, at any depth. */
export const ARCHITECTURE_SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
	'node_modules',
	'dist',
	'build',
	'.git',
	'.cache',
	'.worktrees',
	'coverage',
]);

/** `no-absolute-local-imports`: anchored so a quoted fixture never matches. */
export const ABSOLUTE_SPECIFIER_PATTERNS: readonly RegExp[] = [
	/^[^'"]*\bfrom\s*['"]([^'"]+)['"]/u,
	/^\s*import\s*['"]([^'"]+)['"]/u,
	/^[^'"]*\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/u,
];

/** Findings returned in one payload; the rest are counted, not listed. */
export const MAX_ARCHITECTURE_FINDINGS = 200;
