#!/usr/bin/env bun
/**
 * no-node-imports-in-state.script.ts — q00018 S1 lint.
 *
 * Enforces the architectural invariant of `@delendai/state`:
 * every file under `packages/state/src/**` MUST be pure TypeScript.
 * Same shape as `no-node-imports-in-contracts.script.ts` (r00029 S1)
 * but pointed at the state package. Phase 1's SQLite driver will
 * live in a separate package (`@delendai/state-sqlite`) that
 * explicitly permits Node-only modules.
 *
 * Forbidden patterns:
 *
 *   - `import 'node:*'` / `from 'node:*'`
 *   - `import 'fs'` / `from 'fs'` / `from 'node:fs'`
 *   - `from 'path'`, `from 'os'`, `from 'crypto'`, `from 'stream'`,
 *     `from 'buffer'`, `from 'child_process'`, `from 'http'`,
 *     `from 'https'`, `from 'url'`, `from 'util'`, `from 'zlib'`,
 *     `from 'events'`, `from 'net'`, `from 'tls'`, `from 'dns'`
 *   - `from '@delendai/core'` (would defeat the purpose of a
 *     contract-only package)
 *   - `process.env`, `process.cwd`, `process.exit`, etc.
 *   - `Date.now`, `Math.random`, `crypto.randomBytes`,
 *     `performance.now` (determinism invariant; producers MUST
 *     declare a clock if they need one and the registry hands it
 *     in via the registry options).
 *
 * Designed to be cheap (no AST parse — regex over the source
 * text) and idempotent.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, stat as fsStat } from 'node:fs/promises';
import { join, relative } from 'node:path';

// q00018 Phase 0.1 S8: the boundary now extends across two roots.
// The first is the engine contract surface; the second is where
// plugin-producers will eventually live.
const ROOTS = [
	`${import.meta.dirname ?? import.meta.dir}/../../../packages/state/src`,
	`${import.meta.dirname ?? import.meta.dir}/../../../plugins`,
];

const FORBIDDEN_MODULES = [
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

const FORBIDDEN_AT_DELENDAI = ['@delendai/core', '@delendai/state-sqlite'];

const FORBIDDEN_PROCESS_CALLS = [
	/process\.env\b/,
	/process\.cwd\b/,
	/process\.exit\b/,
	/process\.nextTick\b/,
	/process\.hrtime\b/,
	/process\.platform\b/,
	/process\.version\b/,
];

const FORBIDDEN_NON_DETERMINISTIC = [
	/Date\.now\s*\(/,
	/Math\.random\s*\(/,
	/crypto\.randomBytes\s*\(/,
	/crypto\.randomUUID\s*\(/,
	/performance\.now\s*\(/,
];

interface Violation {
	file: string;
	line: number;
	column: number;
	rule: string;
	snippet: string;
}

async function* walk(dir: string): AsyncIterable<string> {
	if (!existsSync(dir)) return;
	const entries = await readdir(dir);
	for (const entry of entries) {
		const full = join(dir, entry);
		const s = await fsStat(full);
		if (s.isDirectory()) {
			yield* walk(full);
		} else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
			yield full;
		}
	}
}

/**
 * Strip JS/TS comments so the lint never trips on documentation that
 * mentions `Date.now` or `process.cwd` as part of a forbidden-pattern
 * warning. The strip is regex-based, deliberately lossy: a malformed
 * `slash-star ... star-slash` may leave residual characters, but the regexes below
 * never match on the residual because the relevant patterns require
 * a syntactic identifier (e.g. `process.`).
 */
function stripComments(source: string): string {
	const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, '');
	return noBlock.replace(/\/\/.*$/gm, '');
}

function findForbiddenModule(line: string): string | null {
	for (const mod of FORBIDDEN_MODULES) {
		const fromRe = new RegExp(
			`from\\s+['"]${mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
		);
		if (fromRe.test(line)) return mod;
		const importRe = new RegExp(
			`import\\s+['"]${mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
		);
		if (importRe.test(line)) return mod;
		const requireRe = new RegExp(
			`require\\s*\\(\\s*['"]${mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
		);
		if (requireRe.test(line)) return mod;
	}
	return null;
}

function findForbiddenAtDelendai(line: string): string | null {
	for (const mod of FORBIDDEN_AT_DELENDAI) {
		const fromRe = new RegExp(`from\\s+['"]${mod}['"]`);
		if (fromRe.test(line)) return mod;
		const importRe = new RegExp(`import\\s+['"]${mod}['"]`);
		if (importRe.test(line)) return mod;
	}
	return null;
}

function findPattern(line: string, patterns: readonly RegExp[]): string | null {
	for (const p of patterns) {
		if (p.test(line)) return p.source;
	}
	return null;
}

async function* walkScopeRoots(): AsyncIterable<string> {
	for (const root of ROOTS) {
		if (root.endsWith('/plugins')) {
			// Walk plugin-state directories only, not every plugin
			// source file. A plugin that hasn't enabled the State
			// Engine stays outside the boundary.
			const pluginsRoot = root;
			const entries = await readdir(pluginsRoot);
			for (const pluginName of entries) {
				const stateDir = `${pluginsRoot}/${pluginName}/src/lib/state`;
				if (existsSync(stateDir)) {
					yield* walk(stateDir);
				}
			}
			continue;
		}
		yield* walk(root);
	}
}

export async function main(): Promise<number> {
	const violations: Violation[] = [];
	for await (const file of walkScopeRoots()) {
		const text = await readFile(file, 'utf8');
		const lines = stripComments(text).split('\n');
		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i] ?? '';
			const moduleViolation = findForbiddenModule(line);
			if (moduleViolation) {
				violations.push({
					file: relative(process.cwd(), file),
					line: i + 1,
					column: line.indexOf(moduleViolation) + 1,
					rule: 'forbidden-module',
					snippet: line.trim().slice(0, 120),
				});
				continue;
			}
			const atViolation = findForbiddenAtDelendai(line);
			if (atViolation) {
				violations.push({
					file: relative(process.cwd(), file),
					line: i + 1,
					column: line.indexOf(atViolation) + 1,
					rule: 'forbidden-at-delendai',
					snippet: line.trim().slice(0, 120),
				});
				continue;
			}
			const processViolation = findPattern(line, FORBIDDEN_PROCESS_CALLS);
			if (processViolation) {
				violations.push({
					file: relative(process.cwd(), file),
					line: i + 1,
					column: line.indexOf('process.') + 1,
					rule: 'forbidden-process-call',
					snippet: line.trim().slice(0, 120),
				});
				continue;
			}
			const nonDetViolation = findPattern(
				line,
				FORBIDDEN_NON_DETERMINISTIC,
			);
			if (nonDetViolation) {
				violations.push({
					file: relative(process.cwd(), file),
					line: i + 1,
					column:
						line.indexOf(nonDetViolation.split('\\')[0] ?? '') + 1,
					rule: 'forbidden-non-deterministic',
					snippet: line.trim().slice(0, 120),
				});
			}
		}
	}
	if (violations.length === 0) {
		console.log('[no-node-imports-in-state] 0 violations.');
		return 0;
	}
	for (const v of violations) {
		console.error(
			`[no-node-imports-in-state] ${v.file}:${v.line}:${v.column} [${v.rule}] ${v.snippet}`,
		);
	}
	console.error(
		`[no-node-imports-in-state] ${violations.length} violation(s).`,
	);
	return 1;
}

// Allow direct CLI invocation: `bun tools/scripts/lint/no-node-imports-in-state.script.ts`
if (import.meta.main) {
	const code = await main();
	process.exit(code);
}
