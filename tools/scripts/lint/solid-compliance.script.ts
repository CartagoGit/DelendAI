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
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

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

// ──────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────

const TS_EXTS = /\.tsx?$/;

const toRelPosix = (rootDir: string, absPath: string): string => {
	const rel = relative(rootDir, absPath);
	if (rel.startsWith('..') || rel === '') return rel;
	return rel.split(sep).join('/');
};

/**
 * Walk a set of repository-relative roots and return every
 * TypeScript source file beneath them. Skips node_modules, dist,
 * build, cache, and git. Async (the engine is a hot path -
 * see AGENTS rule #3).
 */
export const walkTsFiles = async (
	rootDir: string,
	roots: readonly string[],
): Promise<readonly string[]> => {
	const out: string[] = [];
	const stack: string[] = [...roots];
	while (stack.length > 0) {
		const rel = stack.pop() as string;
		const abs = join(rootDir, rel);
		let entries: readonly import('node:fs').Dirent[];
		try {
			entries = await readdir(abs, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
			if (entry.isDirectory()) {
				if (
					entry.name === 'node_modules' ||
					entry.name === 'dist' ||
					entry.name === 'build' ||
					entry.name === '.cache' ||
					entry.name === '.git'
				)
					continue;
				stack.push(childRel);
				continue;
			}
			if (!entry.isFile()) continue;
			if (!TS_EXTS.test(entry.name)) continue;
			out.push(childRel);
		}
	}
	out.sort((a, b) => a.localeCompare(b));
	return out;
};

/** Count `case` branches and `else if` arms in a single file body. */
const detectLongChains = (
	body: string,
): Array<{
	line: number;
	arms: number;
	snippet: string;
	kind: 'switch' | 'else-if';
}> => {
	const out: Array<{
		line: number;
		arms: number;
		snippet: string;
		kind: 'switch' | 'else-if';
	}> = [];
	// Match switches with `case`
	const switchRegex = /\bswitch\s*\([^)]*\)\s*\{/g;
	let m: RegExpExecArray | null;
	while ((m = switchRegex.exec(body)) !== null) {
		const start = m.index + m[0].length;
		// Find matching closing brace (single-level aware; nested switches are rare)
		let depth = 1;
		let i = start;
		while (i < body.length && depth > 0) {
			const ch = body[i];
			if (ch === '{') depth += 1;
			else if (ch === '}') depth -= 1;
			i += 1;
		}
		const block = body.slice(start, i - 1);
		const cases = block.match(/\bcase\s+[^:]+:/g) ?? [];
		if (cases.length >= 5) {
			out.push({
				line: lineOf(body, m.index),
				arms: cases.length,
				snippet: `switch with ${cases.length} case branches`,
				kind: 'switch',
			});
		}
	}
	// Match chains of `else if` at indentation 0
	const elseIfRegex = /\belse\s+if\s*\(/g;
	const elseIfHits: Array<{ line: number; idx: number }> = [];
	while ((m = elseIfRegex.exec(body)) !== null) {
		elseIfHits.push({ line: lineOf(body, m.index), idx: m.index });
	}
	// Coalesce: consecutive `else if` branches (no intervening `}`-then-new-statement).
	for (let i = 0; i < elseIfHits.length; i += 1) {
		const here = elseIfHits[i];
		if (!here) continue;
		let arms = 1;
		let prev = here.idx;
		for (let j = i + 1; j < elseIfHits.length; j += 1) {
			const next = elseIfHits[j];
			if (!next) continue;
			// same block if distance < 80 chars and no top-level `}` between
			const between = body.slice(prev, next.idx);
			if (between.length > 200) break;
			if (/^\s*return\b/.test(between)) break;
			if (/^\s*}\s*$/.test(between)) break;
			arms += 1;
			prev = next.idx;
		}
		if (arms >= 5) {
			out.push({
				line: here.line,
				arms,
				snippet: `chain of ${arms} else if branches`,
				kind: 'else-if',
			});
			// Skip the consumed hits
			i += arms - 1;
		}
	}
	return out;
};

/** Detect empty `catch {}` blocks and catches whose body is a single comment. */
const detectCatchSwallow = (
	body: string,
): Array<{ line: number; snippet: string }> => {
	const out: Array<{ line: number; snippet: string }> = [];
	const emptyCatch = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
	let m: RegExpExecArray | null;
	while ((m = emptyCatch.exec(body)) !== null) {
		out.push({
			line: lineOf(body, m.index),
			snippet: m[0].replace(/\s+/g, ' '),
		});
	}
	const nothingCatch = /catch\s*(?:\([^)]*\))?\s*\{\s*\/\*[^*]*\*\/\s*\}/g;
	while ((m = nothingCatch.exec(body)) !== null) {
		out.push({
			line: lineOf(body, m.index),
			snippet: m[0].replace(/\s+/g, ' '),
		});
	}
	return out;
};

/** Literal numerics that are NOT magic numbers (whitelist). */
const MAGIC_WHITELIST = new Set([
	'0',
	'1',
	'-1',
	'2',
	'100',
	'1000',
	'0xFF',
	'0xff',
	'0x0',
	'0b0',
	'0b1',
	'60',
	'90',
]);

/** Detect bare numeric literals in plugin source that are not named consts. */
const detectMagicNumbers = (
	body: string,
): Array<{ line: number; value: string; snippet: string }> => {
	const out: Array<{ line: number; value: string; snippet: string }> = [];
	// Single-line, no comments. Naive: a literal that is not part of an identifier
	// and not in a string. Good enough for advisory.
	const literalRegex = /(?<![\w.])(\d{2,})(?![\w])/g;
	let m: RegExpExecArray | null;
	while ((m = literalRegex.exec(body)) !== null) {
		const value = m[1] ?? '';
		if (MAGIC_WHITELIST.has(value)) continue;
		// Skip lines that look like a `const` declaration (named)
		const lineStart = body.lastIndexOf('\n', m.index) + 1;
		const lineEnd = body.indexOf('\n', m.index);
		const line = body.slice(
			lineStart,
			lineEnd === -1 ? body.length : lineEnd,
		);
		if (/\bconst\b/.test(line) && /=\s*\d/.test(line)) continue;
		// Skip obvious non-magic: dead-code branch is allowed; version pins / lengths
		if (/\.length\b/.test(line)) continue;
		if (/\.size\b/.test(line)) continue;
		out.push({
			line: lineOf(body, m.index),
			value,
			snippet: line.trim().slice(0, 120),
		});
	}
	return out;
};

/** 1-based line number. */
const lineOf = (body: string, charIndex: number): number => {
	let line = 1;
	for (let i = 0; i < charIndex && i < body.length; i += 1) {
		if (body.charCodeAt(i) === 10) line += 1;
	}
	return line;
};

/** FNV-1a hash for shingle deduplication. 32-bit, hex. */
const fnv1a = (s: string): string => {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i += 1) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
};

/** Detect 8-line duplicated blocks across plugin sources. */
const detectCrossPluginDuplication = (
	fileContents: ReadonlyMap<string, string>,
): Array<{
	relPath: string;
	line: number;
	hash: string;
	copies: number;
	snippet: string;
}> => {
	const allHashes = new Map<
		string,
		{ relPath: string; line: number; snippet: string }[]
	>();
	const blockLines = 8;
	for (const [relPath, body] of fileContents) {
		const lines = body.split('\n');
		for (let i = 0; i + blockLines <= lines.length; i += 1) {
			const block = lines
				.slice(i, i + blockLines)
				.join('\n')
				.trim();
			if (block.length < 40) continue;
			// Skip blocks that are mostly braces or imports
			if (/^(import\b.*\n){8,}$/.test(block)) continue;
			const hash = fnv1a(block);
			const arr = allHashes.get(hash) ?? [];
			arr.push({
				relPath,
				line: i + 1,
				snippet: block.split('\n')[0] ?? '',
			});
			allHashes.set(hash, arr);
		}
	}
	const out: Array<{
		relPath: string;
		line: number;
		hash: string;
		copies: number;
		snippet: string;
	}> = [];
	for (const [hash, hits] of allHashes) {
		if (hits.length < 2) continue;
		// Different files only
		const distinctFiles = new Set(hits.map((h) => h.relPath));
		if (distinctFiles.size < 2) continue;
		for (const h of hits) {
			out.push({
				relPath: h.relPath,
				line: h.line,
				hash,
				copies: distinctFiles.size,
				snippet: h.snippet.slice(0, 80),
			});
		}
	}
	return out;
};

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
	const dups = detectCrossPluginDuplication(dupSources);
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
