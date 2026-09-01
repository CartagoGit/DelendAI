#!/usr/bin/env bun
/**
 * referenced-scripts-exist.script.ts — every `bun run <script>` a
 * workflow or CI driver invokes must exist in the root package.json.
 *
 * Three separate gates were invoking scripts that had never existed
 * (`lint:architecture`, `tokens:preset-gate`). Each failed instantly with
 * "Script not found", which reads like an ordinary red job, so they sat
 * red indefinitely without anyone learning that the check behind them had
 * never run at all. A typo in a job definition should fail here, where the
 * message names the typo, rather than in the job it silently disables.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

/** Directories scanned for `bun run <script>` references. */
const SCAN_ROOTS = ['.github/workflows', 'tools/scripts/ci'] as const;

const SCRIPT_REFERENCE = /\bbun\s+run\s+([a-zA-Z0-9:_-]+)/g;
/** `bun run` inside a quoted argument list, e.g. `['bun', 'run', 'x']`. */
const ARRAY_REFERENCE = /['"]bun['"]\s*,\s*['"]run['"]\s*,\s*['"]([^'"]+)['"]/g;

export interface IMissingScriptReference {
	readonly file: string;
	readonly script: string;
}

const collectFiles = (root: string, dir: string): readonly string[] => {
	const abs = join(root, dir);
	const out: string[] = [];
	let entries: readonly string[];
	try {
		entries = readdirSync(abs);
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(abs, entry);
		if (statSync(full).isDirectory()) {
			out.push(...collectFiles(root, join(dir, entry)));
			continue;
		}
		if (/\.(ya?ml|ts)$/.test(entry)) out.push(full);
	}
	return out;
};

export const findMissingScriptReferences = (
	root: string,
	declaredScripts: ReadonlySet<string>,
): readonly IMissingScriptReference[] => {
	const missing: IMissingScriptReference[] = [];
	for (const dir of SCAN_ROOTS) {
		for (const file of collectFiles(root, dir)) {
			const content = readFileSync(file, 'utf8');
			for (const pattern of [SCRIPT_REFERENCE, ARRAY_REFERENCE]) {
				pattern.lastIndex = 0;
				let match = pattern.exec(content);
				while (match !== null) {
					const script = match[1];
					if (
						script !== undefined &&
						!declaredScripts.has(script) &&
						!script.startsWith('--')
					) {
						missing.push({
							file: relative(root, file),
							script,
						});
					}
					match = pattern.exec(content);
				}
			}
		}
	}
	return missing;
};

if (import.meta.main === true) {
	const root = repoRoot();
	const pkg = JSON.parse(
		readFileSync(join(root, 'package.json'), 'utf8'),
	) as { scripts?: Record<string, string> };
	const declared = new Set(Object.keys(pkg.scripts ?? {}));
	const missing = findMissingScriptReferences(root, declared);
	if (missing.length === 0) {
		console.log(
			'✓ referenced-scripts-exist: every `bun run` reference resolves.',
		);
		process.exit(0);
	}
	console.error(
		`✖ referenced-scripts-exist: ${missing.length} reference(s) to scripts that do not exist:`,
	);
	for (const entry of missing) {
		console.error(`  ${entry.file}: bun run ${entry.script}`);
	}
	console.error(
		'  fix: correct the script name, or add it to the root package.json.',
	);
	process.exit(1);
}
