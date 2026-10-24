#!/usr/bin/env bun
/**
 * proposals-status.script.ts — f00076 S4.
 *
 * Print a per-kind count of proposals currently archived under
 * `legacy/closed/<kind>/`, plus the total. Lets the operator see
 * archive size without opening folders. Wired in `package.json` as
 * `bun run archive:proposals:status`.
 *
 * Output shape:
 *   legacy/closed/audits: 0
 *   legacy/closed/feats: 0
 *   legacy/closed/fixes: 0
 *   …
 *   ──────
 *   Total: 0
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { KIND_TO_DONE_SUBFOLDER } from '../../../plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant';
import { repoRoot } from '../lib/monorepo-paths';

const main = (): number => {
	const root = repoRoot();
	const archiveRoot = join(
		root,
		'docs',
		'delendai',
		'proposals',
		'legacy',
		'closed',
	);
	let total = 0;
	const counts = new Map<string, number>();
	for (const sub of Object.values(KIND_TO_DONE_SUBFOLDER)) {
		if (sub === undefined) continue;
		const dir = join(archiveRoot, sub);
		if (!existsSync(dir)) {
			counts.set(sub, 0);
			continue;
		}
		const n = readdirSync(dir).filter((name) =>
			name.endsWith('.md'),
		).length;
		counts.set(sub, n);
		total += n;
	}
	const sortedSubs = [...counts.entries()].sort(([a], [b]) =>
		a.localeCompare(b),
	);
	for (const [sub, n] of sortedSubs) {
		console.log(`legacy/closed/${sub}: ${n}`);
	}
	console.log('──────');
	console.log(`Total: ${total}`);
	return 0;
};

process.exit(main());
