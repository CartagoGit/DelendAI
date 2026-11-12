#!/usr/bin/env bun

/**
 * lint:cache-before-install — a dependency cache placed after the
 * install it is meant to serve is not a cache.
 *
 * WHY: `actions/cache` restores when its step RUNS and saves in the
 * post-job phase. Put it after `bun install` and it still saves a store
 * faithfully on every run, and restores it too late for anything to
 * use. Nothing reports that, and nothing can — a cache that never hits
 * is indistinguishable from a cache that is merely cold.
 *
 * NOT a large cost here, measured rather than assumed: a healthy run of
 * this repo installs in ~15s. Across ~30 jobs per pull request it is
 * seconds each, not minutes. It is worth a rule anyway precisely
 * because the symptom is invisible: the only thing a misplaced cache
 * changes is a number nobody is watching, so it can sit wrong
 * indefinitely and get worse as the dependency tree grows.
 *
 * The rule: in any workflow or composite action, a dependency-store
 * cache step must come before the first install step in the same file.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/repo-root';

/** Where the cache and install steps sit, by line, or -1 for absent. */
export const stepOrder = (
	source: string,
): { readonly cache: number; readonly install: number } => {
	const lines = source.split('\n');
	const find = (test: (line: string) => boolean): number =>
		lines.findIndex(test);
	return {
		cache: find((line) => /^\s*-?\s*uses:\s*actions\/cache@/u.test(line)),
		install: find((line) =>
			/^\s*-?\s*run:\s*(bun|npm|pnpm|yarn)\s+(install|ci)\b/u.test(line),
		),
	};
};

/** True when this file gets no benefit from the cache it declares. */
export const cacheIsTooLate = (source: string): boolean => {
	const order = stepOrder(source);
	if (order.cache === -1 || order.install === -1) return false;
	return order.cache > order.install;
};

const yamlFiles = (dir: string): readonly string[] => {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) {
			out.push(...yamlFiles(path));
			continue;
		}
		if (entry.endsWith('.yml') || entry.endsWith('.yaml')) out.push(path);
	}
	return out;
};

const main = (): number => {
	const root = repoRoot();
	const files = [
		...yamlFiles(join(root, '.github/workflows')),
		...yamlFiles(join(root, '.github/actions')),
	];
	const offenders = files.filter((file) =>
		cacheIsTooLate(readFileSync(file, 'utf8')),
	);

	if (offenders.length === 0) {
		console.log(
			`✓ cache-before-install: ${files.length} file(s) checked; every dependency cache precedes its install.`,
		);
		return 0;
	}
	for (const file of offenders) {
		console.error(
			`cache-before-install: ${file.slice(root.length + 1)} restores its cache after installing, so the restore can never be used. Move the \`actions/cache\` step above the install.`,
		);
	}
	return 1;
};

if (import.meta.main) process.exit(main());
