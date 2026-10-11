#!/usr/bin/env bun
/**
 * no-sleep-in-specs.script.ts — stopping the clock is not waiting.
 *
 * `await new Promise(r => setTimeout(r, 400))` in a spec is not a test of
 * the code; it is a test of whether the machine was fast enough that
 * day. It passes on a laptop and fails on a loaded runner, which is the
 * worst distribution of outcomes: the failure arrives detached from the
 * change that caused it, cannot be reproduced where it is investigated,
 * and the two usual responses — a retry, or a bigger number — both hide
 * whatever race is underneath.
 *
 * Measured: `slice-replay` slept 400 ms and then asserted the poll had
 * happened. Five passes out of five locally; red in CI, on three
 * candidates that had not touched it.
 *
 * There are three right answers, in order of preference:
 *
 *  1. FAKE TIMERS — `vi.useFakeTimers()` / `vi.advanceTimersByTimeAsync`.
 *     Anything driven by the clock (an interval, a debounce, a backoff)
 *     becomes instant and deterministic. Stop the clock; do not wait for
 *     it.
 *  2. AWAIT THE THING — when the code is ours, hand the promise back
 *     instead of discarding it, and await that.
 *  3. `waitUntil` from `@delendai/test-kit` — for real I/O finishing in
 *     an async chain nobody owns. It ends the moment the condition holds
 *     and names what it was waiting for when it does not.
 *
 * A spec that genuinely tests timing says so with the waiver, and the
 * reason is then written down where the next reader will find it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	BASELINE_PATH,
	SELF_SPEC,
	SLEEP_PATTERNS,
	WAIVER_MARKER,
} from './no-sleep-in-specs.constant';
import type { ISleepFinding } from './no-sleep-in-specs.interface';

/** Every sleep in one text, with its line. */
export const sleepsIn = (
	text: string,
): readonly { readonly line: number; readonly match: string }[] => {
	const lines = text.split('\n');
	const found: { line: number; match: string }[] = [];
	lines.forEach((line, index) => {
		if (line.includes(WAIVER_MARKER)) return;
		// A waiver on the line above covers the sleep below it, which is
		// where a reader naturally writes the reason.
		if ((lines[index - 1] ?? '').includes(WAIVER_MARKER)) return;
		for (const pattern of SLEEP_PATTERNS) {
			const hit = new RegExp(pattern.source, pattern.flags).exec(line);
			if (hit !== null) {
				found.push({ line: index + 1, match: hit[0].trim() });
				break;
			}
		}
	});
	return found;
};

/** Scan the spec files a caller hands over. */
export const findSleeps = (
	files: readonly { readonly path: string; readonly text: string }[],
): readonly ISleepFinding[] =>
	files.flatMap((file) =>
		sleepsIn(file.text).map((hit) => ({
			path: file.path,
			line: hit.line,
			match: hit.match,
		})),
	);

const specFiles = (
	root: string,
): readonly { readonly path: string; readonly text: string }[] =>
	execFileSync('git', ['ls-files', '-z'], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\0')
		.filter((path) => /\.spec\.ts$|\.test\.ts$/u.test(path))
		// This rule's own spec, which has to contain the shapes it
		// detects — the way a spec for a secret scanner has to contain
		// something that looks like a secret. Exempted by name rather
		// than baselined: it is not debt and will never be paid down.
		.filter((path) => path !== SELF_SPEC)
		.flatMap((path) => {
			try {
				return [{ path, text: readFileSync(join(root, path), 'utf8') }];
			} catch {
				return [];
			}
		});

if (import.meta.main) {
	const root = process.cwd();
	const baseline = existsSync(join(root, BASELINE_PATH))
		? (JSON.parse(readFileSync(join(root, BASELINE_PATH), 'utf8')) as {
				readonly allowed?: readonly string[];
			})
		: {};
	const allowed = new Set(baseline.allowed ?? []);
	const findings = findSleeps(specFiles(root)).filter(
		(finding) => !allowed.has(finding.path),
	);
	if (findings.length === 0) {
		console.log('✓ no-sleep-in-specs: no spec waits on the clock.');
		process.exit(0);
	}
	console.error(
		[
			`✖ no-sleep-in-specs: ${String(findings.length)} sleep(s) in specs.`,
			'',
			...findings
				.slice(0, 20)
				.map((f) => `  ${f.path}:${String(f.line)} — ${f.match}`),
			'',
			'  A sleep tests whether the machine was fast enough, not the code.',
			'',
			'  1. fake timers — `vi.useFakeTimers()`, for anything clock-driven',
			'  2. await the promise — when the code is ours, hand it back',
			'  3. `waitUntil` from `@delendai/test-kit` — for real I/O',
			'',
			`  A spec that genuinely tests timing writes \`${WAIVER_MARKER}\` and why.`,
		].join('\n'),
	);
	process.exit(1);
}
