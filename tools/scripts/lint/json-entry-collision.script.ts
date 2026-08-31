#!/usr/bin/env bun
/**
 * json-entry-collision.script.ts
 *
 * Hard guard against the exact regression that bit us on 2026-08-31:
 * the `commit-policy` `push-scheduler` failed in a loop because
 * `tsconfig.base.json` had FOUR `paths` entries glued together on
 * the same line(s), so JSON.parse still succeeded (the file was
 * technically valid — just badly formatted), but the runtime lost
 * every alias between `@mcp-vertex/api/*` and `@mcp-vertex/web-fetch`
 * and the `host-server.script.ts` boot crashed with the misleading
 * `npm error could not determine executable to run` surface error.
 *
 * What it catches:
 *
 *  1. ENTRY-COLLISION — two JSON object entries on the same physical
 *     line, i.e. `"],\s+"@`. JSONC is allowed (VSCode's
 *     `.vscode/settings.json` has `//` comments and trailing commas),
 *     so the scanner works on a comment-stripped version of the
 *     file before checking line content.
 *
 *  2. INDENT-DRIFT — a JSON key whose leading whitespace is not a
 *     multiple of the file's indent unit (the same indent the
 *     formatter applies — biome uses tabs at width 4, but the lint
 *     is conservative and accepts any uniform indent it finds in
 *     the same object). Catches the "two tabs where its peers use
 *     three" half-edit that produced the broken file.
 *
 *  3. JSONC-COMMA — a JSON object/array close preceded by `,` on the
 *     *same line* as another key (the classic "stale trailing comma
 *     after a multi-entry line" bug, e.g. `}],$` followed by another
 *     entry on the next line that biome-formatters normally fix).
 *
 * Scope:
 *   - Every tracked `*.json` and `*.jsonc` file under the repo root,
 *     except build/cache/node_modules/dist (matches `biome.json`'s
 *     `files.includes` ignore set).
 *
 * Exit codes:
 *   0 — clean
 *   1 — one or more violations found
 *
 * Usage:
 *   bun tools/scripts/lint/json-entry-collision.script.ts
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths.ts';

const IGNORE_DIRS = new Set([
	'node_modules',
	'dist',
	'build',
	'.cache',
	'.worktrees',
	'.astro',
	'.continue',
	'coverage',
	'site',
]);

const IGNORE_FILES = new Set([
	'apps/web/src/data/capabilities.json',
	'apps/web/src/data/skills.json',
]);

const isJsonLike = (name: string): boolean =>
	name.endsWith('.json') || name.endsWith('.jsonc');

interface IViolation {
	readonly file: string;
	readonly line: number;
	readonly rule: 'ENTRY-COLLISION' | 'INDENT-DRIFT' | 'JSONC-COMMA';
	readonly message: string;
}

/**
 * Strip JSONC-only constructs (`//` line comments and `/* … *\/` block
 * comments) so the structural scans run on a JSON-shaped string. We do
 * NOT touch strings, so a `//` inside a JSON string is left alone.
 */
const stripJsoncComments = (raw: string): string => {
	let out = '';
	let i = 0;
	const n = raw.length;
	let inString = false;
	let escaped = false;
	while (i < n) {
		const ch = raw[i] ?? '';
		const next = raw[i + 1] ?? '';
		if (inString) {
			out += ch;
			if (escaped) {
				escaped = false;
			} else if (ch === '\\') {
				escaped = true;
			} else if (ch === '"') {
				inString = false;
			}
			i += 1;
			continue;
		}
		if (ch === '"') {
			inString = true;
			out += ch;
			i += 1;
			continue;
		}
		if (ch === '/' && next === '/') {
			while (i < n && raw[i] !== '\n') i += 1;
			continue;
		}
		if (ch === '/' && next === '*') {
			i += 2;
			while (i < n && !(raw[i] === '*' && raw[i + 1] === '/')) i += 1;
			i += 2;
			continue;
		}
		out += ch;
		i += 1;
	}
	return out;
};

export const scanFile = async (
	absPath: string,
	relPath: string,
): Promise<readonly IViolation[]> => {
	const raw = await readFile(absPath, 'utf8');
	const lines = raw.split('\n');
	const stripped = stripJsoncComments(raw).split('\n');
	const violations: IViolation[] = [];

	// Rule 1: ENTRY-COLLISION — `"],\s+"@` (or any key-shaped token)
	// on the same physical line. The stripped comment-free line is
	// what we check, so a `//` annotation between entries doesn't
	// false-positive.
	const entryRx = /\][ \t]*,[ \t]*"(?:[^"\\]|\\.)*"\s*:/;
	for (let idx = 0; idx < lines.length; idx += 1) {
		const strippedLine = stripped[idx] ?? '';
		if (entryRx.test(strippedLine)) {
			violations.push({
				file: relPath,
				line: idx + 1,
				rule: 'ENTRY-COLLISION',
				message:
					'two JSON object entries share the same physical line — split into one key per line',
			});
		}
	}

	// Rule 2: INDENT-DRIFT — for every JSON-key line, the leading
	// whitespace must match a depth that is a multiple of an indent
	// unit found elsewhere in the file. We pick the unit as the
	// minimum positive indent-step of all keys in the same file
	// (tabs collapse to 1 in the unit sense — biome's `indentStyle`
	// is tab, so the unit is `tab`).
	const keyRx = /^([ \t]*)(?:"(?:[^"\\]|\\.)*"|\d+)\s*:/;
	const depthOf = (line: string): number => {
		const match = keyRx.exec(line);
		if (!match) return -1;
		const leading = match[1] ?? '';
		let depth = 0;
		for (const ch of leading) if (ch === '\t') depth += 1;
		return depth;
	};
	const depths: number[] = [];
	for (const strippedLine of stripped) {
		const d = depthOf(strippedLine);
		if (d > 0) depths.push(d);
	}
	if (depths.length > 0) {
		// Pick the unit as the MODE of observed key depths (the depth
		// that the most keys use). Drift = any key whose depth is not
		// a multiple of that mode. GCD is wrong here because a file
		// with two depth-1 keys and one depth-2 key has GCD=1, which
		// trivially accepts every line — and that's exactly the
		// scenario the regression took.
		const counts = new Map<number, number>();
		for (const d of depths) counts.set(d, (counts.get(d) ?? 0) + 1);
		let unit = 1;
		let bestCount = -1;
		for (const [d, c] of counts) {
			if (c > bestCount || (c === bestCount && d < unit)) {
				unit = d;
				bestCount = c;
			}
		}
		if (unit < 1) unit = 1;
		for (let idx = 0; idx < stripped.length; idx += 1) {
			const strippedLine = stripped[idx] ?? '';
			const depth = depthOf(strippedLine);
			if (depth <= 0) continue;
			if (depth % unit !== 0) {
				violations.push({
					file: relPath,
					line: idx + 1,
					rule: 'INDENT-DRIFT',
					message: `leading indent depth ${depth} is not a multiple of the file's indent unit ${unit}`,
				});
			}
		}
	}

	// Rule 3: JSONC-COMMA — `},` or `],` immediately followed by a
	// key-bearing line below, but the trailing comma was already on a
	// line that ALSO contains an entry to its left. This is the
	// "stale comma left over from a glued line" signature.
	for (let idx = 0; idx < stripped.length; idx += 1) {
		const strippedLine = stripped[idx] ?? '';
		if (!/[,{[]/.test(strippedLine)) continue;
		const closingComma = /,\s*[}\]]\s*$/.test(strippedLine);
		if (!closingComma) continue;
		const next = stripped[idx + 1] ?? '';
		const nextKey = keyRx.exec(next);
		if (!nextKey) continue;
		if (entryRx.test(strippedLine)) continue; // rule 1 already covers this
		violations.push({
			file: relPath,
			line: idx + 1,
			rule: 'JSONC-COMMA',
			message:
				'line ends with a trailing-comma `,]` / `,}` AND a key lives on the next line — likely the residue of a glued multi-entry line',
		});
	}

	return violations;
};

const listTrackedJsonFiles = (rootDir: string): readonly string[] => {
	const out = execFileSync(
		'git',
		['ls-files', '-z', '--', '*.json', '*.jsonc'],
		{ cwd: rootDir, encoding: 'buffer' },
	);
	return out
		.toString('utf8')
		.split('\0')
		.filter((s) => s.length > 0)
		.filter((rel) => !rel.split('/').some((seg) => IGNORE_DIRS.has(seg)))
		.filter((rel) => !IGNORE_FILES.has(rel));
};

const main = async (): Promise<void> => {
	const rootDir = repoRoot();
	const files = listTrackedJsonFiles(rootDir);
	const allViolations: IViolation[] = [];
	for (const rel of files) {
		const abs = join(rootDir, rel);
		const found = await scanFile(abs, rel.split(sep).join('/'));
		allViolations.push(...found);
	}
	if (allViolations.length === 0) {
		console.log(
			'[json-entry-collision] OK — no glued JSON entries, no indent drift.',
		);
		return;
	}
	console.error(
		`[json-entry-collision] ${allViolations.length} violation(s) across ${new Set(allViolations.map((v) => v.file)).size} file(s):`,
	);
	const grouped = new Map<string, IViolation[]>();
	for (const v of allViolations) {
		const arr = grouped.get(v.file) ?? [];
		arr.push(v);
		grouped.set(v.file, arr);
	}
	for (const [file, vs] of [...grouped.entries()].sort(([a], [b]) =>
		a.localeCompare(b),
	)) {
		console.error(`\n  ${relative(rootDir, join(rootDir, file))}`);
		for (const v of vs) {
			console.error(`    L${v.line} [${v.rule}] ${v.message}`);
		}
	}
	process.exit(1);
};

if (import.meta.main) {
	main().catch((err: unknown) => {
		console.error('[json-entry-collision] fatal:', err);
		process.exit(2);
	});
}
