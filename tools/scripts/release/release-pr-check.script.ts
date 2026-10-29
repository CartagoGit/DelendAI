#!/usr/bin/env bun
/**
 * release-pr-check.script.ts — a promotion to main carries a version above
 * main's and a CHANGELOG section for it.
 *
 *   bun run release:check --base=origin/main
 *
 * Every promotion is a release (owner, 2026-10-22). Without this, main
 * received 2,594 commits with no version and no account of what changed;
 * `bun run release:prepare --write` is what prepares both.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/repo-root';

const CORE_MANIFEST = 'packages/core/package.json';

const numbers = (version: string): readonly number[] =>
	version.split('.').map(Number);

/** Whether `a` is a later version than `b`. */
export const isLaterVersion = (a: string, b: string): boolean => {
	const [x, y] = [numbers(a), numbers(b)];
	for (let index = 0; index < 3; index += 1) {
		const diff = (x[index] ?? 0) - (y[index] ?? 0);
		if (diff !== 0) return diff > 0;
	}
	return false;
};

/** What a promotion from `head` over `base` lacks, or nothing when it is a release. */
export const promotionGaps = (input: {
	readonly headVersion: string;
	readonly baseVersion: string;
	readonly changelog: string;
	readonly today: string;
}): readonly string[] => {
	const gaps: string[] = [];
	if (!isLaterVersion(input.headVersion, input.baseVersion))
		gaps.push(
			`the version ${input.headVersion} is not above main's ${input.baseVersion}`,
		);
	const escaped = input.headVersion.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
	const dated = new RegExp(
		`^## \\[${escaped}\\] — (\\d{4}-\\d{2}-\\d{2})`,
		'mu',
	).exec(input.changelog)?.[1];
	if (dated === undefined)
		gaps.push(
			`CHANGELOG.md has no "## [${input.headVersion}] — <date>" section`,
		);
	else if (dated > input.today)
		gaps.push(
			`the CHANGELOG section for ${input.headVersion} is dated ${dated}, after today`,
		);
	return gaps;
};

/**
 * What the checkout at `root` lacks to be released over `base`, read from
 * git and the working tree; a base whose manifest cannot be read is a gap
 * too, never a pass.
 */
export const releaseGaps = (root: string, base: string): readonly string[] => {
	const version = (text: string): string =>
		(JSON.parse(text) as { readonly version: string }).version;
	let baseVersion: string;
	try {
		baseVersion = version(
			execFileSync('git', ['show', `${base}:${CORE_MANIFEST}`], {
				cwd: root,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
			}),
		);
	} catch {
		return [`could not read ${CORE_MANIFEST} at ${base}`];
	}
	return promotionGaps({
		headVersion: version(readFileSync(join(root, CORE_MANIFEST), 'utf8')),
		baseVersion,
		changelog: readFileSync(join(root, 'CHANGELOG.md'), 'utf8'),
		today: new Date().toISOString().slice(0, 10),
	});
};

/** How a checkout that is not a release yet becomes one. */
export const RELEASE_FIX =
	'on develop, `bun run release:prepare --write`, and merge it before promoting.';

const main = (): number => {
	const base =
		process.argv.find((arg) => arg.startsWith('--base='))?.slice(7) ??
		'origin/main';
	const gaps = releaseGaps(repoRoot(), base);
	if (gaps.length === 0) {
		console.log(
			'✓ release:check: the promotion carries its version and its changelog.',
		);
		return 0;
	}
	console.error(
		`✖ release:check: this promotion is not a release yet:\n  ${gaps.join('\n  ')}`,
	);
	console.error(`  Fix: ${RELEASE_FIX}`);
	return 1;
};

if (import.meta.main) process.exit(main());
