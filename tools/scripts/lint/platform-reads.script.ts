#!/usr/bin/env bun
/**
 * platform-reads.script.ts — a platform question asked outside the
 * machine profile is refused.
 *
 * Which operating system this is, and whether it is WSL, used to be
 * decided in every file that needed it (26 `process.platform` reads in 18
 * product files, three readers of `/proc/version`), each a small
 * classification of its own that could disagree with the others. The
 * answer lives in `packages/core/src/lib/platform/`; today's reads
 * elsewhere are a baseline that may only shrink, and a new one fails.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	PLATFORM_DIR,
	PLATFORM_READ_PATTERNS,
	PLATFORM_READS_BASELINE,
	PRODUCT_SOURCE,
} from './platform-reads.constant';

/** How many platform reads each file holds. */
export const countPlatformReads = (
	files: readonly { readonly path: string; readonly text: string }[],
): Readonly<Record<string, number>> => {
	const counts: Record<string, number> = {};
	for (const { path, text } of files) {
		if (path.startsWith(PLATFORM_DIR) || !PRODUCT_SOURCE.test(path))
			continue;
		const reads = text
			.split('\n')
			.filter((line) =>
				PLATFORM_READ_PATTERNS.some((pattern) => pattern.test(line)),
			).length;
		if (reads > 0) counts[path] = reads;
	}
	return counts;
};

/** The files that read more than the baseline allows. */
export const overBaseline = (
	counts: Readonly<Record<string, number>>,
	allowed: Readonly<Record<string, number>>,
): readonly {
	readonly path: string;
	readonly reads: number;
	readonly allowed: number;
}[] =>
	Object.entries(counts)
		.filter(([path, reads]) => reads > (allowed[path] ?? 0))
		.map(([path, reads]) => ({ path, reads, allowed: allowed[path] ?? 0 }));

const productFiles = (
	root: string,
): readonly { readonly path: string; readonly text: string }[] =>
	execFileSync('git', ['ls-files', '-z'], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\0')
		.filter((path) => PRODUCT_SOURCE.test(path))
		.flatMap((path) => {
			try {
				return [{ path, text: readFileSync(join(root, path), 'utf8') }];
			} catch {
				return [];
			}
		});

if (import.meta.main) {
	const root = process.cwd();
	const counts = countPlatformReads(productFiles(root));
	if (process.argv.includes('--update')) {
		const sorted = Object.fromEntries(
			Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
		);
		writeFileSync(
			join(root, PLATFORM_READS_BASELINE),
			`${JSON.stringify({ allowed: sorted }, null, '\t')}\n`,
		);
		console.log(
			`platform-reads: baseline written (${String(Object.keys(sorted).length)} file(s)).`,
		);
		process.exit(0);
	}
	const baseline = existsSync(join(root, PLATFORM_READS_BASELINE))
		? (JSON.parse(
				readFileSync(join(root, PLATFORM_READS_BASELINE), 'utf8'),
			) as {
				readonly allowed?: Readonly<Record<string, number>>;
			})
		: {};
	const over = overBaseline(counts, baseline.allowed ?? {});
	if (over.length === 0) {
		console.log(
			`✓ platform-reads: no platform question outside ${PLATFORM_DIR} beyond the baseline.`,
		);
		process.exit(0);
	}
	console.error(
		[
			`✖ platform-reads: ${String(over.length)} file(s) ask the operating system directly.`,
			...over.map(
				(each) =>
					`  ${each.path}: ${String(each.reads)} read(s), baseline ${String(each.allowed)}`,
			),
			`  Ask the machine profile in ${PLATFORM_DIR} (isWslHere, userConfigRoot, detectSystemProfile) instead.`,
		].join('\n'),
	);
	process.exit(1);
}
