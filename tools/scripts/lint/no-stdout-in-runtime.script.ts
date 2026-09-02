#!/usr/bin/env bun
/**
 * no-stdout-in-runtime.script.ts
 *
 * `console.log` / `console.info` write to **stdout**. In an MCP stdio
 * server stdout is the JSON-RPC channel, so one stray line corrupts the
 * protocol stream — the client reports `Failed to parse message` and
 * gives no clue where it came from. It is a whole-session failure caused
 * by a debug print.
 *
 * Observed live: `plan-closure-bypassed` audit lines went out on
 * `console.info` and the user's client logged parse failures for every
 * one of them. Seven call sites across the runtime had the same bug.
 *
 * Everything operator-facing goes to stderr (`console.warn`,
 * `console.error`, `process.stderr.write`), which the host surfaces as
 * server logs and which no parser is reading.
 *
 * Scope is deliberately narrow: code that runs INSIDE the server —
 * plugin and package `src/` trees. CLI scripts under `tools/` print to
 * stdout on purpose and are not scanned.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../../..');

const SCANNED_ROOTS = [
	'packages/core/src',
	'packages/client/src',
	'packages/contracts/src',
	'packages/cli/src',
];

const VIOLATION = /\bconsole\s*\.\s*(log|info)\s*\(/u;

interface IViolation {
	readonly file: string;
	readonly line: number;
	readonly text: string;
}

const collectFiles = async (dir: string): Promise<string[]> => {
	const out: string[] = [];
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'dist' || entry.name === 'node_modules') {
				continue;
			}
			out.push(...(await collectFiles(full)));
		} else if (
			entry.name.endsWith('.ts') &&
			!entry.name.endsWith('.spec.ts') &&
			!entry.name.endsWith('.test.ts')
		) {
			out.push(full);
		}
	}
	return out;
};

const scanRoots = async (): Promise<string[]> => {
	const roots = [...SCANNED_ROOTS];
	// Every plugin's own `src/` tree, discovered rather than listed, so a
	// new plugin is covered the day it is created.
	const pluginsDir = join(ROOT, 'plugins');
	for (const entry of await readdir(pluginsDir, {
		withFileTypes: true,
	}).catch(() => [])) {
		if (entry.isDirectory()) roots.push(join('plugins', entry.name, 'src'));
	}
	return roots;
};

export const findStdoutWrites = async (): Promise<readonly IViolation[]> => {
	const violations: IViolation[] = [];
	for (const root of await scanRoots()) {
		for (const file of await collectFiles(join(ROOT, root))) {
			const content = await readFile(file, 'utf8').catch(() => '');
			content.split('\n').forEach((line, index) => {
				// A string literal that merely CONTAINS the call (code
				// generators emitting a script) is not a write.
				if (/['"`].*console\s*\.\s*(log|info)/u.test(line)) return;
				if (!VIOLATION.test(line)) return;
				violations.push({
					file: relative(ROOT, file),
					line: index + 1,
					text: line.trim(),
				});
			});
		}
	}
	return violations;
};

const main = async (): Promise<number> => {
	const violations = await findStdoutWrites();
	if (violations.length === 0) {
		console.log(
			'✓ no-stdout-in-runtime: no console.log/info inside server runtime code.',
		);
		return 0;
	}
	console.log(
		`✖ no-stdout-in-runtime: ${violations.length} stdout write(s) in code that runs inside the MCP server:`,
	);
	for (const violation of violations) {
		console.log(`  ${violation.file}:${violation.line}  ${violation.text}`);
	}
	console.log(
		'\n  stdout is the JSON-RPC channel; a line written there corrupts the protocol',
	);
	console.log(
		'  stream and the client reports "Failed to parse message". Use `console.warn`,',
	);
	console.log('  `console.error` or `process.stderr.write` instead.');
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
