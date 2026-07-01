/**
 * format-results-table.ts — Solid SRP extraction.
 *
 * The verify script used to inline a 30-line `console.log` ladder at
 * the bottom of `main()` that turned `IVerifyResult[]` into a fixed-
 * width text table plus a footer with totals. Mixing presentation
 * with orchestration made it impossible to:
 *
 *   - Render the table to anything other than stdout (CI needs JSON
 *     for assertions, a Jira bot needs Slack mrkdwn, a local dev
 *     wants colour).
 *   - Test the formatting (no way to assert "the row for fs_write
 *     reads 'ok'" without booting a fake terminal).
 *
 * After this split:
 *
 *   - **SRP**: formatting is its own module. `main()` just calls
 *     `formatResultsTable(results)` and prints the string.
 *   - **OCP**: new sinks (JSON, Slack, markdown) are new
 *     implementations of the same pure function.
 *   - **Testability**: the formatter is a pure function — tests pin
 *     the exact table output against a fixture of results.
 */

/** A single tool verification outcome — the same shape the probes produce. */
export interface IFormatRow {
	readonly plugin: string;
	readonly tool: string;
	readonly outcome: 'ok' | 'needs-input' | 'failed';
	readonly handlerReturned: boolean;
}

/** Widths are chosen so the table is grep-friendly on 100-col terminals. */
const COL_PLUGIN = 20;
const COL_TOOL = 36;
const COL_OUTCOME = 14;
const COL_HANDLER = 10;
const SEPARATOR = '-'.repeat(
	COL_PLUGIN + COL_TOOL + COL_OUTCOME + COL_HANDLER + 3 /* spaces */,
);

const outcomeMark = (row: IFormatRow): string => {
	switch (row.outcome) {
		case 'ok':
			return '✓ ok';
		case 'needs-input':
			return '~ needs input';
		case 'failed':
			return '✗ failed';
	}
};

const pad = (s: string, width: number): string =>
	s.length >= width ? s : s + ' '.repeat(width - s.length);

/**
 * Pure formatter. Returns the full report (header + rows + footer)
 * as one string. Callers can `console.log` it, write it to a file,
 * or split by `\n` and feed each line to another sink.
 *
 * SOLID: zero side effects, no I/O, no console — `tests formatResultsTable
 * with a known input and asserts the output`.
 */
export const formatResultsTable = (rows: readonly IFormatRow[]): string => {
	const lines: string[] = [];

	// Header
	lines.push(
		`${'Plugin'.padEnd(COL_PLUGIN)} ${'Tool'.padEnd(COL_TOOL)} ${'Outcome'.padEnd(COL_OUTCOME)} ${'Handler'.padEnd(COL_HANDLER)}`,
	);
	lines.push(SEPARATOR);

	let totalOk = 0;
	let totalNeedsInput = 0;
	let totalFailed = 0;

	// Stable order: sort by plugin, then tool.
	const ordered = [...rows].sort(
		(a, b) =>
			a.plugin.localeCompare(b.plugin) || a.tool.localeCompare(b.tool),
	);
	for (const r of ordered) {
		lines.push(
			`${pad(r.plugin, COL_PLUGIN)} ${pad(r.tool, COL_TOOL)} ${pad(outcomeMark(r), COL_OUTCOME)} ${pad(r.handlerReturned ? '✓' : '✗', COL_HANDLER)}`,
		);
		if (r.outcome === 'ok') totalOk += 1;
		else if (r.outcome === 'needs-input') totalNeedsInput += 1;
		else totalFailed += 1;
	}

	lines.push(SEPARATOR);
	lines.push(
		`Total: ${totalOk} ok, ${totalNeedsInput} need-input, ${totalFailed} failed across ${rows.length} tools`,
	);

	return `${lines.join('\n')}\n`;
};
