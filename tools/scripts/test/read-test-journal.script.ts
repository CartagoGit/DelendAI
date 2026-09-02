#!/usr/bin/env bun
/**
 * Print the LAST recorded vitest run in a compact, agent-readable form.
 *
 *   bun run tools/scripts/test/read-test-journal.script.ts
 *
 * Reads `.cache/mcp-vertex/results/logs/test-runs.jsonl` and prints
 * nothing but the failures: file, test name, assertion, expected/
 * received, and the source line inside this repo. No vitest banner, no
 * per-test pass lines, and — the whole point — no second test run.
 *
 * It also states whether the journal still describes the working tree.
 * A stale answer that looks authoritative is worse than no answer, so a
 * changed HEAD or a source file touched after the run is reported at the
 * top, in the imperative: re-run, then read again.
 */
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';

import {
	type ITestFailureRecord,
	type ITestRunEntry,
	journalPath,
	readRunEntries,
} from './test-journal.ts';

interface IStaleness {
	readonly stale: boolean;
	readonly headMoved?: {
		readonly recorded: string;
		readonly current: string;
	};
	readonly changedFiles: readonly {
		readonly file: string;
		readonly ageMs: number;
	}[];
	readonly changedCount: number;
	readonly checked: boolean;
}

const gitLines = (
	args: readonly string[],
	cwd: string,
): string[] | undefined => {
	try {
		return execFileSync('git', [...args], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			maxBuffer: 64 * 1024 * 1024,
			timeout: 20_000,
		})
			.split('\n')
			.filter((line) => line !== '');
	} catch {
		return undefined;
	}
};

/**
 * A file is "changed since the run" when its mtime is newer than the run
 * timestamp. Only tracked, test-relevant source files count — a rebuilt
 * `dist/` or a rewritten cache entry does not invalidate a test result.
 */
const RELEVANT = /\.(ts|tsx|js|mjs|cjs|jsx|json|astro|scss|css|md)$/;

export const detectStaleness = (
	entry: ITestRunEntry,
	workspaceRoot: string,
): IStaleness => {
	const runMs = Date.parse(entry.timestamp);
	const files = gitLines(['ls-files'], workspaceRoot);
	if (files === undefined || Number.isNaN(runMs)) {
		return {
			stale: false,
			changedFiles: [],
			changedCount: 0,
			checked: false,
		};
	}
	const changed: { file: string; ageMs: number }[] = [];
	for (const file of files) {
		if (!RELEVANT.test(file)) continue;
		try {
			const mtime = statSync(join(workspaceRoot, file)).mtimeMs;
			if (mtime > runMs)
				changed.push({ file, ageMs: Date.now() - mtime });
		} catch {
			/* deleted since `ls-files`; not evidence of anything */
		}
	}
	changed.sort((a, b) => a.ageMs - b.ageMs);
	const currentHead = gitLines(['rev-parse', 'HEAD'], workspaceRoot)?.[0];
	const headMoved =
		entry.gitHead !== undefined &&
		currentHead !== undefined &&
		currentHead !== entry.gitHead
			? { recorded: entry.gitHead, current: currentHead }
			: undefined;
	return {
		stale: changed.length > 0 || headMoved !== undefined,
		...(headMoved !== undefined ? { headMoved } : {}),
		changedFiles: changed.slice(0, 10),
		changedCount: changed.length,
		checked: true,
	};
};

const humanAge = (ms: number): string => {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 90) return `${seconds}s ago`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 90) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours}h ago`;
	return `${Math.round(hours / 24)}d ago`;
};

const indent = (text: string, pad: string): string =>
	text
		.split('\n')
		.map((line) => `${pad}${line}`)
		.join('\n');

const formatFailure = (
	failure: ITestFailureRecord,
	options: { readonly showDiff: boolean },
): string[] => {
	const out: string[] = [];
	out.push(`  ✗ ${failure.fullName}`);
	const header =
		failure.errorName !== undefined &&
		!failure.message.startsWith(failure.errorName)
			? `${failure.errorName}: ${failure.message}`
			: failure.message;
	out.push(indent(header, '      '));
	if (failure.sourceFrame !== undefined) {
		const frame = failure.sourceFrame;
		out.push(
			`      at ${frame.file}:${frame.line}:${frame.column}${
				frame.method !== undefined && frame.method !== ''
					? ` (${frame.method})`
					: ''
			}`,
		);
	}
	if (failure.expected !== undefined || failure.actual !== undefined) {
		out.push(`      expected: ${failure.expected ?? '(none)'}`);
		out.push(`      received: ${failure.actual ?? '(none)'}`);
	}
	if (options.showDiff && failure.diff !== undefined) {
		out.push(indent(failure.diff, '      '));
	}
	if (failure.stack !== undefined && failure.stack.length > 0) {
		out.push(
			`      also: ${failure.stack
				.slice(0, 3)
				.map((frame) => `${frame.file}:${frame.line}`)
				.join(' · ')}`,
		);
	}
	return out;
};

export const formatReport = (input: {
	readonly entry: ITestRunEntry;
	readonly staleness: IStaleness;
	readonly limit: number;
	readonly showDiff: boolean;
	readonly now?: number;
}): string => {
	const { entry, staleness } = input;
	const now = input.now ?? Date.now();
	const lines: string[] = [];
	lines.push(
		`last run: ${entry.result.toUpperCase()} — ${entry.timestamp} (${humanAge(
			now - Date.parse(entry.timestamp),
		)}) · runId ${entry.runId}`,
	);
	lines.push(`command:  ${entry.command}`);
	lines.push(
		`totals:   ${entry.totals.files} files · ${entry.totals.tests} tests · ${entry.totals.passed} passed · ${entry.totals.failed} failed · ${entry.totals.skipped} skipped · ${Math.round(
			entry.durationMs / 1000,
		)}s`,
	);
	if (entry.reason !== 'passed' && entry.reason !== 'failed') {
		lines.push(
			`reason:   ${entry.reason} (the run did not finish normally)`,
		);
	}
	if (!staleness.checked) {
		lines.push(
			'freshness: UNKNOWN — could not consult git, so this may not describe the working tree.',
		);
	} else if (staleness.stale) {
		lines.push('');
		lines.push('STALE — this journal predates the current working tree:');
		if (staleness.headMoved !== undefined) {
			lines.push(
				`  HEAD moved ${staleness.headMoved.recorded.slice(0, 8)} → ${staleness.headMoved.current.slice(0, 8)}`,
			);
		}
		if (staleness.changedCount > 0) {
			lines.push(
				`  ${staleness.changedCount} tracked source file(s) modified since the run:`,
			);
			for (const changed of staleness.changedFiles) {
				lines.push(`    ${changed.file} (${humanAge(changed.ageMs)})`);
			}
			if (staleness.changedCount > staleness.changedFiles.length) {
				lines.push(
					`    … and ${staleness.changedCount - staleness.changedFiles.length} more`,
				);
			}
		}
		lines.push('  → re-run the tests before trusting the failures below.');
	} else {
		lines.push(
			'freshness: current — nothing tracked has changed since the run.',
		);
	}

	if (entry.failures.length === 0) {
		lines.push('');
		lines.push(
			entry.result === 'pass'
				? 'No failures recorded. The last run was green.'
				: 'The run is marked failed but recorded no individual failures — check the reason above.',
		);
		return lines.join('\n');
	}

	const byFile = new Map<string, ITestFailureRecord[]>();
	for (const failure of entry.failures) {
		const bucket = byFile.get(failure.file) ?? [];
		bucket.push(failure);
		byFile.set(failure.file, bucket);
	}
	let printed = 0;
	for (const [file, bucket] of byFile) {
		if (printed >= input.limit) break;
		lines.push('');
		const project = bucket[0]?.project;
		lines.push(`${file}${project !== undefined ? `  [${project}]` : ''}`);
		for (const failure of bucket) {
			if (printed >= input.limit) break;
			lines.push(...formatFailure(failure, { showDiff: input.showDiff }));
			printed += 1;
		}
	}
	const remaining = entry.failures.length - printed;
	if (remaining > 0) {
		lines.push('');
		lines.push(`… ${remaining} more failure(s) not shown (raise --limit).`);
	}
	if (entry.failuresOmitted !== undefined) {
		lines.push(
			`(${entry.failuresOmitted} further failure(s) were never recorded — per-run cap.)`,
		);
	}
	return lines.join('\n');
};

const numericFlag = (
	argv: readonly string[],
	flag: string,
	fallback: number,
): number => {
	const index = argv.indexOf(flag);
	if (index === -1) return fallback;
	const value = Number(argv[index + 1]);
	return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const main = (
	argv: readonly string[] = process.argv.slice(2),
	workspaceRoot: string = process.cwd(),
): number => {
	const entries = readRunEntries(workspaceRoot);
	const entry = entries.at(-1);
	if (entry === undefined) {
		console.log(
			[
				`NO RUN RECORDED — ${journalPath(workspaceRoot)} is empty or missing.`,
				'This is not "the last run was green": no run has been journalled yet.',
				'Run `bun run test` (or any vitest invocation) once and read this again.',
			].join('\n'),
		);
		return 0;
	}
	if (argv.includes('--json')) {
		console.log(JSON.stringify(entry, null, 2));
		return 0;
	}
	if (argv.includes('--history')) {
		const count = numericFlag(argv, '--history', 10);
		for (const item of entries.slice(-count)) {
			console.log(
				`${item.timestamp}  ${item.result.padEnd(4)}  ${String(
					item.totals.failed,
				).padStart(
					3,
				)} failed / ${item.totals.tests} tests  ${item.command}`,
			);
		}
		return 0;
	}
	console.log(
		formatReport({
			entry,
			staleness: detectStaleness(entry, workspaceRoot),
			limit: numericFlag(argv, '--limit', 20),
			showDiff: !argv.includes('--no-diff'),
		}),
	);
	return 0;
};

if (import.meta.main) {
	process.exit(main());
}
