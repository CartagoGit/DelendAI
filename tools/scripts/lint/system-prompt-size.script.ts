#!/usr/bin/env bun
/**
 * system-prompt-size.script.ts — f00086 S3.
 *
 * Byte-budget guardrail on the "system prompt" every host loads on cold
 * start: the three canonical host-instruction files
 * (`AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`) plus the
 * shared bootstrap they all link to (`docs/mcp-vertex/AGENT-BOOTSTRAP.md`).
 *
 * These files are prepended to (or loaded alongside) the model's context
 * on the FIRST turn of every session, so their combined size is paid on
 * every cache miss. f00086's goal is a right-sized system prompt; this
 * lint makes "right-sized" a measurable, regressing-blocks-CI promise.
 *
 * This is complementary to two existing guardrails, not a duplicate:
 *
 *   - `host-instructions.script.ts` (f00084 S1) enforces the *content*
 *     contract (no id enumeration, must link the bootstrap). It says
 *     nothing about size.
 *   - `token-budget.e2e.spec.ts` (N23) benchmarks the *runtime* tool
 *     payloads (`overview`, `auto_work`, …) over the protocol. It says
 *     nothing about the static instruction files.
 *
 * This lint closes the remaining gap: the static bytes the host injects
 * before any tool is ever called.
 *
 * Budgets are per-file byte caps recorded below with the measured
 * baseline. When a legitimate change grows a file, bump its budget here
 * with a dated one-line rationale (same convention as the e2e budgets),
 * so every growth is a reviewed, intentional decision.
 *
 * Usage:
 *   bun tools/scripts/lint/system-prompt-size.script.ts
 *   bun tools/scripts/lint/system-prompt-size.script.ts --root=/abs/path
 *
 * Exit codes:
 *   0 — every tracked file is within budget
 *   1 — one or more files exceed their budget
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface IPromptSizeBudget {
	/** Repo-relative path of the tracked file. */
	readonly file: string;
	/** Upper byte cap. Bump with a dated rationale when a change grows it. */
	readonly maxBytes: number;
}

/**
 * The static "system prompt" surface, with per-file byte budgets.
 *
 * Measured baseline 2026-07-01 (f00086 S3):
 *   AGENTS.md                          16_539B
 *   CLAUDE.md                           2_481B
 *   .github/copilot-instructions.md     3_001B
 *   docs/mcp-vertex/AGENT-BOOTSTRAP.md 23_002B
 *
 * Budgets are set ~10% above the baseline: enough headroom for small
 * edits, tight enough that a real bloat (a re-enumerated catalog, a
 * pasted-in doc) trips the lint. Tightening is always welcome; loosening
 * needs a dated rationale line.
 */
export const PROMPT_SIZE_BUDGETS: readonly IPromptSizeBudget[] = [
	{ file: 'AGENTS.md', maxBytes: 18_000 },
	{ file: 'CLAUDE.md', maxBytes: 3_000 },
	{ file: '.github/copilot-instructions.md', maxBytes: 3_400 },
	{ file: 'docs/mcp-vertex/AGENT-BOOTSTRAP.md', maxBytes: 25_500 },
] as const;

export interface IPromptSizeResult {
	readonly file: string;
	readonly bytes: number;
	readonly maxBytes: number;
	readonly overBudget: boolean;
	readonly missing: boolean;
}

/** Measure every tracked file against its budget. */
export const measurePromptSizes = async (
	workspaceRoot: string,
	budgets: readonly IPromptSizeBudget[] = PROMPT_SIZE_BUDGETS,
): Promise<readonly IPromptSizeResult[]> => {
	const results: IPromptSizeResult[] = [];
	for (const budget of budgets) {
		const abs = resolve(workspaceRoot, budget.file);
		const text = await readFile(abs, 'utf8').catch(() => undefined);
		if (text === undefined) {
			results.push({
				file: budget.file,
				bytes: 0,
				maxBytes: budget.maxBytes,
				overBudget: false,
				missing: true,
			});
			continue;
		}
		const bytes = Buffer.byteLength(text, 'utf8');
		results.push({
			file: budget.file,
			bytes,
			maxBytes: budget.maxBytes,
			overBudget: bytes > budget.maxBytes,
			missing: false,
		});
	}
	return results;
};

export const formatResults = (
	results: readonly IPromptSizeResult[],
): string => {
	const lines: string[] = [];
	for (const r of results) {
		if (r.missing) {
			lines.push(`  MISSING ${r.file} (tracked but not found)`);
			continue;
		}
		const pct = Math.round((r.bytes / r.maxBytes) * 100);
		const flag = r.overBudget ? 'OVER   ' : 'ok     ';
		lines.push(
			`  ${flag} ${r.file}: ${r.bytes}B / ${r.maxBytes}B (${pct}%)`,
		);
	}
	return lines.join('\n');
};

const parseArgs = (argv: readonly string[]): { root: string } => {
	let root = process.cwd();
	for (const arg of argv) {
		if (arg.startsWith('--root=')) root = arg.slice('--root='.length);
	}
	return { root };
};

const main = async (): Promise<number> => {
	const { root } = parseArgs(process.argv.slice(2));
	const results = await measurePromptSizes(root);
	const over = results.filter((r) => r.overBudget);
	// A tracked file that is missing is a silent-drift hazard (a rename
	// that dropped it from the system prompt), so treat it as a failure.
	const missing = results.filter((r) => r.missing);
	console.log('system-prompt size budget:');
	console.log(formatResults(results));
	if (over.length === 0 && missing.length === 0) {
		return 0;
	}
	if (over.length > 0) {
		console.error(
			`\nBLOCKING: ${over.length} file(s) exceed the system-prompt byte budget.`,
		);
		console.error(
			'Shrink the file, or bump its budget in system-prompt-size.script.ts',
		);
		console.error(
			'with a dated one-line rationale (see the e2e token-budget convention).',
		);
	}
	if (missing.length > 0) {
		console.error(
			`\nBLOCKING: ${missing.length} tracked file(s) missing — did a rename drop them from the system prompt?`,
		);
	}
	return 1;
};

if (import.meta.main) {
	const code = await main();
	process.exit(code);
}

export const _internal = { parseArgs, main };
