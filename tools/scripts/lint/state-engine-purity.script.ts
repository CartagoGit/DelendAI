#!/usr/bin/env bun
/**
 * state-engine-purity.script.ts — c00514 (strict contract).
 *
 * Enforces the purity invariant of the state-engine: producers are
 * pure transformations, only storage adapters persist. Concretely:
 *
 *   - Every `.ts` file under `packages/state/src/**` MUST NOT import
 *     a persistent I/O API: `node:fs*`, `node:fs/promises`,
 *     `Bun.write`, `better-sqlite3`, `bun:sqlite`, or anything else
 *     that can read or write durable storage.
 *   - Spec files are exempt (they may need fixtures); generated
 *     artefacts are exempt (they are not authored).
 *
 * Phase 0 (this proposal) covers `packages/state/src/**` only; q00019
 * S5 extends the rule to the state-sqlite package and introduces the
 * companion `state-engine-isolation.lint.ts`. The earlier permissive
 * draft (which allowed writes under `.cache/delendai/state/**` from
 * producer code) was rejected by review: it recreated the two-truths
 * anti-pattern. The strict contract removes the ambiguity: no
 * producer writes anywhere; storage adapters write via
 * `ArtifactStore.put` only.
 *
 * Usage:
 *   bun tools/scripts/lint/state-engine-purity.script.ts           # check
 *   bun tools/scripts/lint/state-engine-purity.script.ts --report  # counts only
 *
 * Failure prints every offending file with the offending import
 * specifier and exits 1. The script does NOT maintain a baseline —
 * the strict contract makes "tolerated violations" impossible by
 * construction. The companion baseline (if any) is a TODO for q00019
 * S5, when the rule is extended to state-sqlite and the SQLite driver
 * itself is exempted from a subset.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { walkTsFiles } from '@delendai/core/public';

import { repoRoot } from '../lib/monorepo-paths';

const SCAN_GLOBS: readonly string[] = ['packages/state/src'];

const SPEC_SUFFIX = '.spec.ts';
const TEST_SUFFIX = '.test.ts';
const GENERATED_SUFFIX = '.generated.ts';
const DTS_SUFFIX = '.d.ts';

/**
 * Persistent-I/O APIs the purity layer must not import. Each entry
 * is matched both as a bare specifier (`from "fs"`) and as a
 * `node:`-prefixed one (`from "node:fs"`). `Bun.write`,
 * `better-sqlite3`, and `bun:sqlite` are matched as bare literals.
 *
 * NOTE: `node:crypto`, `node:path`, etc. are NOT in the list — the
 * contract is about persistence, not all of `node:*`. A producer
 * MAY import `node:path` (it's a pure transformation on a string)
 * without violating the rule. `node:crypto.randomBytes()` would be
 * a violation if used as persistence, but the import itself is not.
 */
const PERSISTENT_IO_SPECIFIERS: readonly string[] = [
	'fs',
	'fs/promises',
	'fs-sync',
	'fs/crypto',
	'fs/dns',
	'fs/stream',
	'stream',
	'stream/promises',
	'stream/web',
	'stream/consumers',
	'better-sqlite3',
	'bun:sqlite',
	'sqlite',
	'sqlite3',
	'drizzle-orm',
	'drizzle-orm/better-sqlite3',
	'drizzle-orm/bun-sqlite',
	'pg',
	'mysql2',
	'mongodb',
	'redis',
	'ioredis',
	'level',
	'leveldb',
];

/** `Bun.write(...)` is a global; the lint also flags the bare token
 *  when it appears as a callee in a producer file. */
const BUN_IO_RE = /\bBun\s*\.\s*(?:write|file|sqlite|s3)\b/;

/** Match `from "fs"` / `from "node:fs"` / `require("fs")` etc. */
const SPEC_RE =
	/(?:from\s+|require\(\s*|import\(\s*)['"](?:node:)?([^'"]+)['"]/g;

export interface IPurityViolation {
	readonly relPath: string;
	readonly specifier: string;
	readonly line: number;
}

const isExemptFile = (rel: string): boolean =>
	rel.endsWith(SPEC_SUFFIX) ||
	rel.endsWith(TEST_SUFFIX) ||
	rel.endsWith(GENERATED_SUFFIX) ||
	rel.endsWith(DTS_SUFFIX);

const scanFile = (absPath: string, relPath: string): IPurityViolation[] => {
	const out: IPurityViolation[] = [];
	const body = readFileSync(absPath, 'utf8');
	for (const [i, line] of body.split('\n').entries()) {
		// Bun.<io> global callee
		if (BUN_IO_RE.test(line)) {
			out.push({
				relPath,
				specifier: line.trim(),
				line: i + 1,
			});
			continue;
		}
		// Reset regex state across lines.
		SPEC_RE.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = SPEC_RE.exec(line)) !== null) {
			const spec = m[1] ?? '';
			if (PERSISTENT_IO_SPECIFIERS.includes(spec)) {
				out.push({
					relPath,
					specifier: `import "${spec}"`,
					line: i + 1,
				});
			}
		}
	}
	return out;
};

export const scanPurityViolations = async (
	root: string = repoRoot(),
): Promise<readonly IPurityViolation[]> => {
	const all = await walkTsFiles(root, SCAN_GLOBS);
	const offenders: IPurityViolation[] = [];
	for (const rel of all) {
		if (isExemptFile(rel)) continue;
		offenders.push(...scanFile(join(root, rel), rel));
	}
	offenders.sort((a, b) =>
		a.relPath === b.relPath
			? a.line - b.line
			: a.relPath.localeCompare(b.relPath),
	);
	return offenders;
};

const main = async (): Promise<number> => {
	const root = repoRoot();
	const args = new Set(process.argv.slice(2));
	const violations = await scanPurityViolations(root);

	if (args.has('--report')) {
		process.stderr.write(
			`state-engine-purity: ${violations.length} violation(s) across ${
				new Set(violations.map((v) => v.relPath)).size
			} file(s).\n`,
		);
		return 0;
	}

	if (violations.length === 0) {
		process.stdout.write(
			'✓ state-engine-purity: every file under packages/state/src/** is pure (no persistent I/O imports).\n',
		);
		return 0;
	}

	process.stdout.write(
		`✖ state-engine-purity: ${violations.length} violation(s) in packages/state/src/** — producers MUST be pure.\n` +
			'  Convention: producers are pure transformations; storage adapters persist via ArtifactStore.put.\n' +
			'  If a file under packages/state/src/** genuinely needs persistent I/O, it belongs in the storage adapter\n' +
			'  layer (q00019 S1), not here.\n\n',
	);
	for (const v of violations) {
		process.stdout.write(
			`  ${relative(root, v.relPath) || v.relPath}:${v.line}  ${v.specifier}\n`,
		);
	}
	return 1;
};

if (import.meta.main) process.exit(await main());

// Avoid "unused" complaints in callers that only import the symbols.
void existsSync;
void writeFileSync;
