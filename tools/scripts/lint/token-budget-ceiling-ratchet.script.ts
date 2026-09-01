#!/usr/bin/env bun
/**
 * token-budget-ceiling-ratchet.script.ts — r00036 (AUD-B03).
 *
 * The budget contract (`token-budgets.constant.ts`) documents a
 * `bumpPolicy` with four required steps, but nothing enforced that a
 * ceiling raise actually followed it — the contract's own comments
 * record two prior raises ("the current 69,115 B roster needs a small,
 * explicit guard band" -> `lean.hard: 70_000`; "the bump covers that
 * cost plus a small safety margin" -> `swarm.hard: 210_000`) with no
 * automated check that either was deliberate rather than reflexive.
 *
 * This lint is the enforcement: any `hard`/`warning`/
 * `marginalPluginHard`/`marginalPluginWarning` ceiling in the contract
 * may only INCREASE relative to the committed ratchet baseline
 * (`token-budget-ceiling-ratchet.baseline.json`) when the constant file
 * carries a matching, unexpired exception comment:
 *
 *   // budget-exception-pending: presets.swarm.toolsList.hard
 *   // budget-exception-expires: 2026-09-30
 *
 * Mirrors the shape `capabilities-declared.script.ts` already uses for
 * `capabilities-pending` / `capabilities-migration-due` — same idea
 * (a documented, dated exception that expires) applied to a different
 * domain, not a second mechanism.
 *
 * Lowering a ceiling always passes with no exception needed. Once an
 * exception's `budget-exception-expires` date has passed, the ceiling
 * must revert to (or below) the baselined value, or the lint fails
 * again — a stale exception does not grandfather the raise forever.
 *
 * `--update` rewrites the baseline to the CURRENT contract values, but
 * refuses to do so if any raised key still lacks a valid, unexpired
 * exception — so the escape hatch cannot be used to launder an
 * undocumented raise into the new floor.
 *
 * Pure helpers are exported for the spec; `main()` is the only
 * filesystem-touching piece.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	TOKEN_BUDGETS,
	type ITokenBudgetRegistry,
} from '@mcp-vertex/core/public';

import { repoRoot } from '../lib/monorepo-paths';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IBudgetException {
	readonly key: string;
	readonly expiresOn: string;
}

export type IBudgetCeilingSnapshot = Readonly<Record<string, number>>;

export interface IRatchetViolation {
	readonly key: string;
	readonly baselineValue: number;
	readonly currentValue: number;
	readonly kind: 'raised-without-exception' | 'exception-expired';
	readonly note: string;
}

export interface IRatchetReport {
	readonly ok: boolean;
	readonly violations: readonly IRatchetViolation[];
	readonly checkedKeys: number;
}

export interface IUpdateViolationBuckets {
	readonly expired: readonly IRatchetViolation[];
	readonly undocumented: readonly IRatchetViolation[];
}

// ---------------------------------------------------------------------------
// Flatten the contract into `dotted.path -> value` ceiling entries
// ---------------------------------------------------------------------------

const CEILING_FIELDS = [
	'hard',
	'warning',
	'marginalPluginHard',
	'marginalPluginWarning',
] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Walks `toolPayloads` and `presets` and pulls out every
 * `hard`/`warning`/`marginalPluginHard`/`marginalPluginWarning` numeric
 * field, keyed by its dotted path (e.g. `presets.swarm.toolsList.hard`).
 * Pure — operates on the already-imported registry object, no fs.
 */
export const flattenTokenBudgetCeilings = (
	registry: ITokenBudgetRegistry,
): IBudgetCeilingSnapshot => {
	const out: Record<string, number> = {};
	const visit = (node: unknown, path: string): void => {
		if (!isPlainObject(node)) return;
		for (const field of CEILING_FIELDS) {
			const value = node[field];
			if (typeof value === 'number') {
				out[`${path}.${field}`] = value;
			}
		}
		for (const [key, value] of Object.entries(node)) {
			if (isPlainObject(value)) visit(value, `${path}.${key}`);
		}
	};
	visit(registry.toolPayloads, 'toolPayloads');
	visit(registry.presets, 'presets');
	return out;
};

// ---------------------------------------------------------------------------
// Parse `budget-exception-*` comments out of the constant file's source
// ---------------------------------------------------------------------------

const PENDING_RE = /^\/\/\s*budget-exception-pending:\s*(.+)$/u;
const EXPIRES_RE =
	/^\/\/\s*budget-exception-expires:\s*(\d{4}-\d{2}-\d{2})\s*$/u;

/**
 * Parses `// budget-exception-pending: <key>[, <key>...]` followed by
 * `// budget-exception-expires: <YYYY-MM-DD>` pairs out of the constant
 * file's raw source. The expiry line must be the pending line's next
 * non-blank line — same locality the capabilities lint relies on for
 * its own pending/migration-due pair. Pure over the source string.
 */
export const parseBudgetExceptions = (
	source: string,
): readonly IBudgetException[] => {
	const exceptions: IBudgetException[] = [];
	const lines = source.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = (lines[i] ?? '').trim();
		const pendingMatch = PENDING_RE.exec(line);
		if (pendingMatch === null) continue;
		const keys = (pendingMatch[1] as string)
			.split(',')
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0);
		let expiresOn: string | null = null;
		for (let j = i + 1; j < lines.length; j++) {
			const candidate = (lines[j] ?? '').trim();
			if (candidate.length === 0) continue;
			const expiresMatch = EXPIRES_RE.exec(candidate);
			if (expiresMatch !== null) expiresOn = expiresMatch[1] as string;
			break;
		}
		if (expiresOn === null) continue;
		for (const key of keys) {
			exceptions.push({ key, expiresOn });
		}
	}
	return exceptions;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

/** Has the exception's expiry date passed (today >= expiresOn)? Pure. */
export const isExceptionExpired = (
	expiresOn: string,
	today: Date = new Date(),
): boolean => {
	if (!ISO_DATE_RE.test(expiresOn)) return true; // malformed -> expired
	const todayUtc = Date.UTC(
		today.getUTCFullYear(),
		today.getUTCMonth(),
		today.getUTCDate(),
	);
	const [year, month, day] = expiresOn.split('-').map(Number) as [
		number,
		number,
		number,
	];
	const dueUtc = Date.UTC(year, month - 1, day);
	return todayUtc >= dueUtc;
};

// ---------------------------------------------------------------------------
// Ratchet comparison
// ---------------------------------------------------------------------------

/**
 * Compares `current` ceilings against the committed `baseline`. A key
 * missing from the baseline is a first observation, not a raise, and is
 * never a violation (it becomes part of the floor on the next
 * `--update`). Lowering or holding steady always passes. Raising
 * requires a matching entry in `exceptions` whose `expiresOn` has not
 * passed `today`. Pure.
 */
export const computeRatchetViolations = (
	current: IBudgetCeilingSnapshot,
	baseline: IBudgetCeilingSnapshot,
	exceptions: readonly IBudgetException[],
	today: Date = new Date(),
): readonly IRatchetViolation[] => {
	const exceptionByKey = new Map<string, IBudgetException>();
	for (const exception of exceptions) {
		exceptionByKey.set(exception.key, exception);
	}
	const violations: IRatchetViolation[] = [];
	for (const [key, currentValue] of Object.entries(current)) {
		const baselineValue = baseline[key];
		if (baselineValue === undefined) continue; // first observation
		if (currentValue <= baselineValue) continue; // lowering always passes
		const exception = exceptionByKey.get(key);
		if (exception === undefined) {
			violations.push({
				key,
				baselineValue,
				currentValue,
				kind: 'raised-without-exception',
				note: `${key} raised ${baselineValue} -> ${currentValue} with no 'budget-exception-pending: ${key}' comment in token-budgets.constant.ts`,
			});
			continue;
		}
		if (isExceptionExpired(exception.expiresOn, today)) {
			violations.push({
				key,
				baselineValue,
				currentValue,
				kind: 'exception-expired',
				note: `${key} raised ${baselineValue} -> ${currentValue} but its exception expired on ${exception.expiresOn}; revert to ${baselineValue} or document a fresh exception with a new expires-on`,
			});
		}
	}
	return violations.sort((left, right) => left.key.localeCompare(right.key));
};

export const buildRatchetReport = (
	current: IBudgetCeilingSnapshot,
	baseline: IBudgetCeilingSnapshot,
	exceptions: readonly IBudgetException[],
	today: Date = new Date(),
): IRatchetReport => {
	const violations = computeRatchetViolations(
		current,
		baseline,
		exceptions,
		today,
	);
	return {
		ok: violations.length === 0,
		violations,
		checkedKeys: Object.keys(current).length,
	};
};

export const classifyUpdateViolations = (
	violations: readonly IRatchetViolation[],
): IUpdateViolationBuckets => ({
	expired: violations.filter(
		(violation) => violation.kind === 'exception-expired',
	),
	undocumented: violations.filter(
		(violation) => violation.kind === 'raised-without-exception',
	),
});

// ---------------------------------------------------------------------------
// Baseline I/O
// ---------------------------------------------------------------------------

export const BASELINE_REL =
	'tools/scripts/lint/token-budget-ceiling-ratchet.baseline.json';
export const CONSTANT_REL =
	'packages/core/src/lib/contracts/constants/token-budgets.constant.ts';

export const loadRatchetBaseline = async (
	path: string,
): Promise<IBudgetCeilingSnapshot> => {
	const raw = await readFile(path, 'utf8').catch(() => null);
	if (raw === null) return {};
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!isPlainObject(parsed)) return {};
		const out: Record<string, number> = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value === 'number') out[key] = value;
		}
		return out;
	} catch {
		return {};
	}
};

export const writeRatchetBaseline = async (
	path: string,
	snapshot: IBudgetCeilingSnapshot,
): Promise<void> => {
	const sorted: Record<string, number> = {};
	for (const key of Object.keys(snapshot).sort((a, b) =>
		a.localeCompare(b),
	)) {
		sorted[key] = snapshot[key] as number;
	}
	await writeFile(path, `${JSON.stringify(sorted, null, '\t')}\n`, 'utf8');
};

const formatReport = (report: IRatchetReport): string => {
	if (report.ok) {
		return `✓ token-budget-ceiling-ratchet: ${report.checkedKeys} ceiling(s) checked, no undocumented raise.`;
	}
	const lines = [
		`✖ token-budget-ceiling-ratchet: ${report.violations.length} ceiling(s) raised without a valid exception`,
	];
	for (const violation of report.violations) {
		lines.push(`  ${violation.note}`);
	}
	lines.push(
		'  Document with a `// budget-exception-pending: <key>` + `// budget-exception-expires: <YYYY-MM-DD>` pair in token-budgets.constant.ts, following the bumpPolicy (justify the cost, show the benefit, attempt a compensation, document the decision).',
	);
	return lines.join('\n');
};

// ---------------------------------------------------------------------------
// CLI shell
// ---------------------------------------------------------------------------

const main = async (argv: readonly string[]): Promise<number> => {
	const root = repoRoot();
	const baselinePath = join(root, BASELINE_REL);
	const constantPath = join(root, CONSTANT_REL);
	const source = await readFile(constantPath, 'utf8');
	const exceptions = parseBudgetExceptions(source);
	const current = flattenTokenBudgetCeilings(TOKEN_BUDGETS);
	const baseline = await loadRatchetBaseline(baselinePath);

	if (argv.includes('--update')) {
		const violations = computeRatchetViolations(
			current,
			baseline,
			exceptions,
		);
		const { expired: blocking, undocumented } =
			classifyUpdateViolations(violations);
		if (blocking.length > 0) {
			console.error(
				`✖ token-budget-ceiling-ratchet --update refused: ${blocking.length} raise(s) have an expired exception. Revert those ceilings or document a fresh exception first.\n${blocking
					.map((violation) => `  ${violation.note}`)
					.join('\n')}`,
			);
			return 1;
		}
		if (undocumented.length > 0) {
			console.error(
				`✖ token-budget-ceiling-ratchet --update refused: ${undocumented.length} raise(s) have no documented exception at all. Add \`budget-exception-pending\`/\`budget-exception-expires\` comments before locking in a higher floor.\n${undocumented
					.map((violation) => `  ${violation.note}`)
					.join('\n')}`,
			);
			return 1;
		}
		await writeRatchetBaseline(baselinePath, current);
		console.log(
			`token-budget-ceiling-ratchet: baseline updated — ${Object.keys(current).length} ceiling(s) at ${BASELINE_REL}.`,
		);
		return 0;
	}

	const report = buildRatchetReport(current, baseline, exceptions);
	console.log(formatReport(report));
	return report.ok ? 0 : 1;
};

if (import.meta.main) {
	main(process.argv.slice(2)).then((code) => process.exit(code));
}
