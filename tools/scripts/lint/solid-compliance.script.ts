#!/usr/bin/env bun
/**
 * solid-compliance.script.ts — c00125.
 *
 * Enforces the §6 / §7.1 #12 invariant from c00124 (SOLID / Clean Code
 * / reusable code / good practices are non-negotiable by default).
 *
 * The script is hermetic, fast (< 500 ms on the whole repo), and uses
 * only `node:fs/promises` + regex heuristics — no AST, no language
 * server. It follows the canonical pattern of the existing lints
 * (`walkAndClassify` → pure engine → `formatReport` → `main` shell).
 *
 * Rule set (each rule is a `ISolidRule` with a stable id, priority,
 * and a `scan(file)` -> findings predicate):
 *
 *   - "long-switch-chain"        — ≥ 5 `case` branches in a single
 *                                  `switch` statement OR ≥ 5 consecutive
 *                                  `else if` arms. Anti-pattern that
 *                                  §7.1 #12 forbids: route through the
 *                                  existing registries instead.
 *   - "oversized-file"           — files > 400 LOC. SRP violation
 *                                  signal; advisory.
 *   - "catch-swallow"            — empty `catch {}` (empty body) or
 *                                  a `catch` whose body is a single
 *                                  comment with no real handling.
 *                                  Clean Code forbids.
 *   - "magic-number-in-plugin"   — literal numeric in any plugin
 *                                  source file that is not declared
 *                                  as a `const` in the same file
 *                                  (whitelist: 0, 1, -1, 2, 100,
 *                                  1000, 0xFF, parseFlag bits).
 *   - "duplicated-cross-plugin"  — same 8-line block (shingle hash)
 *                                  appearing in two or more files
 *                                  under plugins/<name>/src/lib/.
 *                                  Pure duplication signal.
 *
 * Usage:
 *   bun tools/scripts/lint/solid-compliance.script.ts
 *   bun tools/scripts/lint/solid-compliance.script.ts --roots=plugins/search
 *   bun tools/scripts/lint/solid-compliance.script.ts --report
 *
 * Exit codes:
 *   0 — clean
 *   1 — one or more findings
 *
 * SOLID: this file is the orchestrator. The actual rule engine is
 * exported as `classifySolidFindings(root, files)` so tests can drive
 * it with synthetic file lists without touching the filesystem.
//
// c00126 S3: pure helpers were extracted to packages/core/src/lib/scan/
// and re-exported from the public barrel; this file now only orchestrates.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	detectCatchSwallow,
	detectLongChains,
	detectMagicNumbers,
	lineOf,
	shingleBlocks,
	toRelPosix,
	walkTsFiles,
} from '@mcp-vertex/core/public';

// ──────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────

export type SolidRuleId =
	| 'long-switch-chain'
	| 'oversized-file'
	| 'catch-swallow'
	| 'magic-number-in-plugin'
	| 'duplicated-cross-plugin';

export interface ISolidFinding {
	readonly id: SolidRuleId;
	readonly priority: number;
	readonly relPath: string;
	readonly line: number;
	readonly message: string;
	readonly snippet: string;
}

export interface ISolidScanOptions {
	readonly rootDir: string;
	readonly files: readonly string[];
	/** Maximum LOC per file before "oversized-file" fires. Default 400. */
	readonly maxLoc?: number;
	/** Minimum `case` / `else if` arms before "long-switch-chain" fires. Default 5. */
	readonly minChainArms?: number;
	/** Minimum copies of a block before "duplicated-cross-plugin" fires. Default 2. */
	readonly minDupCopies?: number;
}

export interface ISolidScanResult {
	readonly rootDir: string;
	readonly findings: readonly ISolidFinding[];
	readonly scannedFiles: number;
	readonly elapsedMs: number;
}

/** Rule priority — lower number = higher priority (matches `lint:bootstrap-canonical`). */
const RULE_PRIORITY: Record<SolidRuleId, number> = {
	'long-switch-chain': 10,
	'oversized-file': 20,
	'catch-swallow': 30,
	'magic-number-in-plugin': 40,
	'duplicated-cross-plugin': 50,
};

// ──────────────────────────────────────────────────────────────────────────
// Pure engine
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pure engine. Reads nothing from disk — caller passes the file contents
 * map. Tests use this with synthetic fixtures; the CLI shell builds the
 * map from `walkTsFiles` + parallel `readFile`.
 */
export const classifySolidFindings = async (
	rootDir: string,
	fileContents: ReadonlyMap<string, string>,
	options: Partial<Omit<ISolidScanOptions, 'rootDir' | 'files'>> = {},
): Promise<ISolidScanResult> => {
	const start = Date.now();
	const maxLoc = options.maxLoc ?? 400;
	const minChainArms = options.minChainArms ?? 5;
	const minDupCopies = options.minDupCopies ?? 2;
	const findings: ISolidFinding[] = [];
	const pluginFiles = new Map<string, string>();

	for (const [relPath, body] of fileContents) {
		// oversized-file
		const loc = body.split('\n').length;
		if (loc > maxLoc) {
			findings.push({
				id: 'oversized-file',
				priority: RULE_PRIORITY['oversized-file'],
				relPath,
				line: 1,
				message: `file is ${loc} LOC (max ${maxLoc}); consider splitting per SRP`,
				snippet: '',
			});
		}
		// long-switch-chain
		const chains = detectLongChains(body);
		for (const ch of chains) {
			if (ch.arms >= minChainArms) {
				findings.push({
					id: 'long-switch-chain',
					priority: RULE_PRIORITY['long-switch-chain'],
					relPath,
					line: ch.line,
					message: `${ch.snippet} — route through a registry instead (§7.1 #12)`,
					snippet: ch.snippet,
				});
			}
		}
		// catch-swallow
		const swallows = detectCatchSwallow(body);
		for (const s of swallows) {
			findings.push({
				id: 'catch-swallow',
				priority: RULE_PRIORITY['catch-swallow'],
				relPath,
				line: s.line,
				message: `empty catch block — clean code forbids swallowed errors`,
				snippet: s.snippet,
			});
		}
		// magic-number-in-plugin (only in plugins/*)
		if (relPath.startsWith('plugins/')) {
			pluginFiles.set(relPath, body);
			const mags = detectMagicNumbers(body);
			for (const m of mags) {
				findings.push({
					id: 'magic-number-in-plugin',
					priority: RULE_PRIORITY['magic-number-in-plugin'],
					relPath,
					line: m.line,
					message: `magic number ${m.value} — extract to a named const`,
					snippet: m.snippet,
				});
			}
		}
	}

	// cross-plugin duplication (only over plugins/*/src/lib/)
	const dupSources = new Map<string, string>();
	for (const [relPath, body] of pluginFiles) {
		if (relPath.includes('/src/lib/')) {
			dupSources.set(relPath, body);
		}
	}
	const dups = shingleBlocks(dupSources);
	const dupFilter = dups.filter((d) => d.copies >= minDupCopies);
	for (const d of dupFilter) {
		findings.push({
			id: 'duplicated-cross-plugin',
			priority: RULE_PRIORITY['duplicated-cross-plugin'],
			relPath: d.relPath,
			line: d.line,
			message: `block (hash ${d.hash}) duplicated across ${d.copies} plugin files — extract to packages/core/src/public/`,
			snippet: d.snippet,
		});
	}

	// Sort by (priority, relPath, line)
	findings.sort((a, b) => {
		if (a.priority !== b.priority) return a.priority - b.priority;
		if (a.relPath !== b.relPath) return a.relPath.localeCompare(b.relPath);
		return a.line - b.line;
	});

	// Touch rootDir so the param is not flagged as unused in strict mode
	void toRelPosix(rootDir, rootDir);

	return {
		rootDir,
		findings,
		scannedFiles: fileContents.size,
		elapsedMs: Date.now() - start,
	};
};

// ──────────────────────────────────────────────────────────────────────────
// Reporting
// ──────────────────────────────────────────────────────────────────────────

export const formatReport = (result: ISolidScanResult): string => {
	const lines: string[] = [];
	lines.push(
		`solid-compliance: scanned ${result.scannedFiles} files in ${result.elapsedMs} ms`,
	);
	if (result.findings.length === 0) {
		lines.push('  ✓ no findings');
		return lines.join('\n');
	}
	const byId = new Map<SolidRuleId, ISolidFinding[]>();
	for (const f of result.findings) {
		const arr = byId.get(f.id) ?? [];
		arr.push(f);
		byId.set(f.id, arr);
	}
	for (const [id, group] of byId) {
		lines.push(`  [${id}] ${group.length}`);
		for (const f of group) {
			lines.push(`    ${f.relPath}:${f.line}  ${f.message}`);
		}
	}
	return lines.join('\n');
};

// ──────────────────────────────────────────────────────────────────────────
// CLI shell
// ──────────────────────────────────────────────────────────────────────────

const DEFAULT_ROOTS = ['plugins', 'packages/core/src/lib'];

const parseArgs = (
	argv: readonly string[],
): {
	roots: readonly string[];
	report: boolean;
} => {
	const roots: string[] = [];
	let report = false;
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === '--report') {
			report = true;
		} else if (a?.startsWith('--roots=') && a.length > 8) {
			roots.push(...a.slice(8).split(',').filter(Boolean));
		}
	}
	return {
		roots: roots.length > 0 ? roots : DEFAULT_ROOTS,
		report,
	};
};

export const main = async (argv: readonly string[]): Promise<number> => {
	const { roots, report } = parseArgs(argv);
	const rootDir = process.cwd();
	const files = await walkTsFiles(rootDir, roots);
	const fileContents = new Map<string, string>();
	await Promise.all(
		files.map(async (rel) => {
			const abs = join(rootDir, rel);
			fileContents.set(rel, await readFile(abs, 'utf8'));
		}),
	);
	const result = await classifySolidFindings(rootDir, fileContents);
	const out = formatReport(result);
	if (report) {
		process.stderr.write(
			`solid-compliance: ${result.findings.length} findings\n`,
		);
	} else {
		process.stdout.write(`${out}\n`);
	}
	return result.findings.length === 0 ? 0 : 1;
};

// Run when invoked directly (`bun tools/scripts/lint/solid-compliance.script.ts`)
const entrypoint = process.argv[1] ?? '';
if (entrypoint.endsWith('solid-compliance.script.ts')) {
	const code = await main(process.argv.slice(2));
	process.exit(code);
}
