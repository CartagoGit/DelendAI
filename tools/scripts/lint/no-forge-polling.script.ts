#!/usr/bin/env bun
/**
 * no-forge-polling.script.ts
 *
 * Forge events reach delendai the moment they happen, so product code
 * never asks the forge on a timer. A recurring timer (`setInterval`) in a
 * source file that also talks to the forge or a git remote is a poll loop
 * until a person has said why it is not one.
 *
 * Every such file is listed below with its reason: a fallback that runs
 * only while no event connection is up, or a timer that pushes or beats a
 * local lease and never asks. A new poll loop is not on the list and
 * fails; a listed file that no longer holds the timer fails too, so the
 * list cannot outlive the code it excuses.
 *
 * The lint says what it measured and fails when it measured nothing.
 */
import { readdir, readFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, relative } from 'node:path';
import { lintRepoRoot, refuseMissingScanRoots } from './lib/scan-roots.lib';

const ROOT = lintRepoRoot(import.meta.url);

const SCANNED_ROOTS = [
	'packages/core/src',
	'packages/client/src',
	'packages/cli/src',
	'plugins',
	'tools/scripts/host',
];

const TIMER = /\bsetInterval\s*\(/u;
const FORGE = /forge|remote|\brunGh\b|\bgh\b|['"]fetch['"]/iu;

/** The recurring timers a file holds next to a forge or remote, and why each is not a poll. */
export const ALLOWED_TIMERS: Readonly<Record<string, string>> = {
	'packages/core/src/lib/startup-reconciler/hydration-watch.ts':
		'the fallback watch: started only while no forge event connection is up',
	'tools/scripts/host/forge-event-follow.service.ts':
		'the fallback watch of the host, stopped while an event connection is up',
	'tools/scripts/host/host-server.script.ts':
		'a keep-alive that does nothing and asks no one',
	'packages/core/src/lib/development-policy/maintenance-lease.service.ts':
		'beats the local maintenance lease; no forge call',
	'packages/core/src/lib/wip-engine/work-checkout-publisher.ts':
		'pushes a work ref on a schedule; pushing is not asking',
	'plugins/commit-policy/src/index.ts':
		'the policy interval check of the local checkout',
	'plugins/commit-policy/src/lib/services/push-scheduler.ts':
		'pushes reconciled commits on a schedule; pushing is not asking',
};

export interface IPollFinding {
	readonly file: string;
	readonly line: number;
	readonly text: string;
}

export interface IPollScan {
	readonly filesScanned: number;
	readonly timersSeen: ReadonlySet<string>;
	readonly violations: readonly IPollFinding[];
}

const collectFiles = async (dir: string): Promise<string[]> => {
	const out: string[] = [];
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (
				entry.name === 'dist' ||
				entry.name === 'node_modules' ||
				entry.name === 'tests'
			)
				continue;
			out.push(...(await collectFiles(full)));
		} else if (
			entry.name.endsWith('.ts') &&
			!entry.name.endsWith('.spec.ts') &&
			!entry.name.endsWith('.generated.ts')
		) {
			out.push(full);
		}
	}
	return out;
};

/** The findings of one file's text; pure, so a spec feeds it text. */
export const scanText = (
	file: string,
	text: string,
): { readonly timer: boolean; readonly findings: readonly IPollFinding[] } => {
	const lines = text.split('\n');
	const timerLines = lines.flatMap((line, index) =>
		TIMER.test(line) ? [{ line: index + 1, text: line.trim() }] : [],
	);
	if (timerLines.length === 0 || !FORGE.test(text))
		return { timer: false, findings: [] };
	return {
		timer: true,
		findings: timerLines.map((entry) => ({ file, ...entry })),
	};
};

export const scanForgePolling = async (
	root: string,
	roots: readonly string[],
): Promise<IPollScan> => {
	const violations: IPollFinding[] = [];
	const timersSeen = new Set<string>();
	let filesScanned = 0;
	for (const scanRoot of roots) {
		for (const path of await collectFiles(join(root, scanRoot))) {
			filesScanned += 1;
			const file = relative(root, path);
			const text = await readFile(path, 'utf8').catch(() => '');
			const found = scanText(file, text);
			if (!found.timer) continue;
			timersSeen.add(file);
			if (file in ALLOWED_TIMERS) continue;
			violations.push(...found.findings);
		}
	}
	return { filesScanned, timersSeen, violations };
};

/** Listed files that hold no such timer any more. */
export const staleAllowances = (scan: IPollScan): readonly string[] =>
	Object.keys(ALLOWED_TIMERS).filter((file) => !scan.timersSeen.has(file));

const main = async (): Promise<number> => {
	if (refuseMissingScanRoots('no-forge-polling', ROOT, SCANNED_ROOTS))
		return 1;
	const scan = await scanForgePolling(ROOT, SCANNED_ROOTS);
	if (scan.filesScanned === 0) {
		console.error(
			'✖ no-forge-polling: no source file was scanned; a lint over nothing proves nothing.',
		);
		return 1;
	}
	const stale = staleAllowances(scan);
	if (scan.violations.length === 0 && stale.length === 0) {
		console.log(
			`✓ no-forge-polling: ${scan.filesScanned} file(s) scanned, ${scan.timersSeen.size} recurring timer file(s) next to a forge, all explained.`,
		);
		return 0;
	}
	for (const violation of scan.violations) {
		console.log(
			`✖ no-forge-polling: ${violation.file}:${violation.line}  ${violation.text}`,
		);
	}
	for (const file of stale) {
		console.log(
			`✖ no-forge-polling: ${file} is listed in ALLOWED_TIMERS but holds no such timer; remove the entry.`,
		);
	}
	console.log(
		'\n  Forge events arrive by push (forge_await, the event bridge); do not ask the forge on a timer.',
	);
	console.log(
		'  A timer that is not a poll goes in ALLOWED_TIMERS with its reason.',
	);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
