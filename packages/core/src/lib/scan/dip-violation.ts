/**
 * dip-violation.ts — Dependency Inversion violation detector (c00126 S4).
 *
 * Catches two anti-patterns that the §7.1 invariant forbids:
 *
 *   - §7.1 #2: "No `process.cwd()` in engines" — the runtime must come
 *     from `ctx.workspace` / `corePaths` / injected options, not from
 *     the global process object.
 *
 *   - §7.1 #3: "Async I/O only in hot paths. Sync filesystem calls are
 *     allowed only at boot." — engines and tools that import sync
 *     functions from `node:fs` (other than boot-time exemptions) are
 *     flagged.
 *
 * Pure: takes a body string and a context (relPath for scope), returns
 * findings. The caller decides which paths count as engines. By default
 * any file under plugins/<name>/src/lib, packages/core/src/lib, or
 * apps/web/src is in scope.
 */
import { lineOf } from './text-utils';

export type DipKind = 'process-cwd' | 'sync-fs-import';

export interface IDipHit {
	readonly line: number;
	readonly kind: DipKind;
	readonly snippet: string;
}

/** Paths exempt from the dip-violation rule. */
const EXEMPT_PATH_PATTERNS: readonly RegExp[] = [
	// Boot-time config loaders are explicitly allowed sync FS.
	/packages\/core\/src\/lib\/configuration-center\//,
	// The code-map resource is a startup-boundary adapter: it resolves the
	// workspace once before exposing a resource snapshot to the client.
	/packages\/core\/src\/lib\/code-map\//,
	/packages\/core\/src\/lib\/install\//,
	/packages\/core\/src\/lib\/setup\//,
	/packages\/core\/src\/lib\/cli\/parse-cli-args/,
	// Scaffold GENERATORS emit code (template literals), they do not run
	// it: a cwd read inside an emitted `src/server.ts` body is the
	// generated entry point, not a runtime read in this module.
	/packages\/core\/src\/lib\/scaffold\//,
];

/** Sync node:fs functions that are not allowed outside boot. */
const SYNC_FS_FUNCTIONS: readonly string[] = [
	'readFileSync',
	'writeFileSync',
	'appendFileSync',
	'unlinkSync',
	'mkdirSync',
	'rmSync',
	'renameSync',
	'copyFileSync',
	'statSync',
	'lstatSync',
	'readdirSync',
	'existsSync',
	'realpathSync',
	'symlinkSync',
	'readlinkSync',
	'chmodSync',
	'chownSync',
	'utimesSync',
];

const processCwdRegex = /\bprocess\.cwd\s*\(/g;
const syncFsImportRegex = new RegExp(
	`\\b(?:import|require)\\b[^;]*\\b(?:${SYNC_FS_FUNCTIONS.join('|')})\\b`,
	'g',
);

const isExempt = (relPath: string): boolean => {
	return EXEMPT_PATH_PATTERNS.some((p) => p.test(relPath));
};

const isInScope = (relPath: string): boolean => {
	return (
		relPath.startsWith('plugins/') ||
		relPath.startsWith('packages/core/src/lib/') ||
		relPath.startsWith('apps/web/src/')
	);
};

/**
 * Tests are not a runtime hot path: they legitimately use process.cwd
 * and sync `node:fs` helpers for hermetic fixtures. The §7.1 invariant
 * governs product code, so specs never count as DIP violations.
 */
const isTestFile = (relPath: string): boolean =>
	relPath.includes('/tests/') ||
	relPath.endsWith('.spec.ts') ||
	relPath.endsWith('.test.ts');

/**
 * Detect DIP violations in `body` for the file at `relPath`.
 * Returns one hit per finding.
 */
export const detectDipViolations = (
	relPath: string,
	body: string,
): readonly IDipHit[] => {
	if (!isInScope(relPath) || isExempt(relPath) || isTestFile(relPath)) {
		return [];
	}
	const out: IDipHit[] = [];
	let m: RegExpExecArray | null;
	m = processCwdRegex.exec(body);
	while (m !== null) {
		out.push({
			line: lineOf(body, m.index),
			kind: 'process-cwd',
			snippet: m[0],
		});
		m = processCwdRegex.exec(body);
	}
	m = syncFsImportRegex.exec(body);
	while (m !== null) {
		out.push({
			line: lineOf(body, m.index),
			kind: 'sync-fs-import',
			snippet: m[0].replace(/\s+/g, ' ').slice(0, 120),
		});
		m = syncFsImportRegex.exec(body);
	}
	return out;
};
