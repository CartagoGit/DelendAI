#!/usr/bin/env bun
/**
 * no-core-public-types-in-client.script.ts — r00030 lint.
 *
 * Enforces that `packages/client/src/**` does NOT import TYPES from
 * `@delendai/core/public` (or bare `@delendai/core`). Type-only
 * imports of `@delendai/core/contracts` are the canonical alternative
 * for client code; runtime values must still come from
 * `@delendai/core/public`.
 *
 * Flags:
 *   - `import type { X } from '@delendai/core'`        (bare default)
 *   - `import type { X } from '@delendai/core/public'` (the runtime barrel)
 *   - `import { type X } from '@delendai/core/public'`  (mixed imports)
 *
 * Skips:
 *   - Anything in `node_modules`, `dist`, or `.cache`.
 *   - Comments.
 *   - Non-import lines (e.g. references inside JSDoc are fine).
 */

import { readdir, readFile, stat as fsStat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = `${import.meta.dirname ?? import.meta.dir}/../../../packages/client/src`;

const TYPE_IMPORT =
	/(?:^|\s)(?:import\s+type\s*\{|import\s*\{[^}]*\btype\b[^}]*\})\s*([^;]+)\s+from\s+['"](@delendai\/core(?:\/public)?)['"]/;

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
		} else if (
			entry.endsWith('.ts') &&
			!entry.endsWith('.spec.ts') &&
			!entry.endsWith('.test.ts')
		) {
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
		if (line.trim().startsWith('//') || line.trim().startsWith('*'))
			continue;
		const m = TYPE_IMPORT.exec(line);
		if (m !== null) {
			findings.push({
				line: i + 1,
				reason: `type-only import from '${m[2]}' — migrate to '@delendai/core/contracts'`,
			});
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
			`no-core-public-types-in-client: 0 violations across ${files.length} file(s).\n`,
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
		`\nno-core-public-types-in-client: ${allFindings.length} file(s) violated the contract.\n`,
	);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
