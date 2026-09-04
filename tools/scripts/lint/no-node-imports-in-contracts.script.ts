#!/usr/bin/env bun
/**
 * no-node-imports-in-contracts.script.ts — r00029 lint.
 *
 * Enforces the architectural invariant of
 * `@delendai/contracts`: every file under
 * `packages/contracts/src/**` MUST be pure TypeScript. Any of:
 *
 *   - `import 'node:*'` / `from 'node:*'`
 *   - `import 'fs'` / `from 'fs'` / `from 'node:fs'`
 *   - `from 'path'`, `from 'os'`, `from 'crypto'`, `from 'stream'`,
 *     `from 'buffer'`, `from 'child_process'`, `from 'http'`,
 *     `from 'https'`, `from 'url'`, `from 'util'`, `from 'zlib'`,
 *     `from 'events'`, `from 'net'`, `from 'tls'`, `from 'dns'`
 *   - `from '@delendai/core'` (would defeat the purpose of the
 *     type-only surface)
 *   - `process.env`, `process.cwd`, `process.exit`, etc.
 *
 * results in a lint failure. Designed to be cheap (no AST parse —
 * regex over the source text) and idempotent.
 */

import { readdir, readFile, stat as fsStat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = `${import.meta.dirname ?? import.meta.dir}/../../../packages/contracts/src`;

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
	'@delendai/core',
];

const FORBIDDEN_PROCESS = [
	/\bprocess\.env\b/,
	/\bprocess\.cwd\b/,
	/\bprocess\.exit\b/,
	/\bprocess\.argv\b/,
	/\bprocess\.platform\b/,
	/\bprocess\.version\b/,
];

const walk = async (dir: string): Promise<readonly string[]> => {
	const out: string[] = [];
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return [];
	}
	for (const entry of entries) {
		const full = join(dir, entry);
		const s = await fsStat(full).catch(() => null);
		if (s === null) continue;
		if (s.isDirectory()) {
			out.push(...(await walk(full)));
		} else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
			out.push(full);
		}
	}
	return out;
};

const lintOne = async (
	file: string,
): Promise<readonly { line: number; reason: string }[]> => {
	const text = await readFile(file, 'utf8');
	const findings: { line: number; reason: string }[] = [];
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? '';
		// Skip comments — they don't import anything.
		const trimmed = line.trim();
		if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
		for (const mod of FORBIDDEN_MODULES) {
			const re = new RegExp(
				`(from\\s+['"]${mod.replace(/[.+*?^${}()|[\\]\\\\]/g, '\\$&')}['"])|` +
					`(import\\s+['"]${mod.replace(/[.+*?^${}()|[\\]\\\\]/g, '\\$&')}['"])`,
			);
			if (re.test(line)) {
				findings.push({
					line: i + 1,
					reason: `forbidden module: ${mod}`,
				});
			}
		}
		for (const re of FORBIDDEN_PROCESS) {
			if (re.test(line)) {
				findings.push({
					line: i + 1,
					reason: `forbidden global: ${re.source}`,
				});
			}
		}
	}
	return findings;
};

export const main = async (): Promise<number> => {
	const files = await walk(ROOT);
	const allFindings: {
		file: string;
		findings: readonly { line: number; reason: string }[];
	}[] = [];
	for (const file of files) {
		const findings = await lintOne(file);
		if (findings.length > 0) {
			allFindings.push({ file: relative(process.cwd(), file), findings });
		}
	}
	if (allFindings.length === 0) {
		process.stdout.write(
			`no-node-imports-in-contracts: 0 violations across ${files.length} file(s).\n`,
		);
		return 0;
	}
	for (const { file, findings } of allFindings) {
		process.stdout.write(`\n${file}\n`);
		for (const f of findings) {
			process.stdout.write(`  line ${f.line}: ${f.reason}\n`);
		}
	}
	process.stdout.write(
		`\nno-node-imports-in-contracts: ${allFindings.length} file(s) violated the contract.\n`,
	);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
