#!/usr/bin/env bun
/**
 * proof-check.script.ts — does the pull request carry a local proof that
 * stands for it?
 *
 *   bun tools/scripts/ci/proof-check.script.ts --head=<sha> --base=<sha>
 *
 * Prints `proved=true|false` for the job outputs and the reason on stderr.
 * The plan is recomputed here, for the base the proof names, so a proof
 * made under other planning rules does not stand.
 */
import { execFileSync } from 'node:child_process';

import { judgeProof, planDigestOf, readProof } from './proof';

const arg = (name: string): string | undefined =>
	process.argv
		.find((value) => value.startsWith(`--${name}=`))
		?.slice(name.length + 3);

const git = (args: readonly string[]): string =>
	execFileSync('git', args, { encoding: 'utf8' }).trim();

const main = (): number => {
	const head = arg('head');
	const prBase = arg('base');
	if (head === undefined || prBase === undefined) {
		console.log('proved=false');
		console.error('proof-check: no head or base given; nothing is proved.');
		return 0;
	}
	const base = git(['merge-base', prBase, head]);
	const matrix = execFileSync(
		'bun',
		['tools/scripts/ci/test-zones.script.ts', '--matrix', `--base=${base}`],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
	);
	const verdict = judgeProof({
		proof: readProof(head),
		head,
		tree: git(['rev-parse', `${head}^{tree}`]),
		base,
		planDigest: planDigestOf(matrix),
	});
	console.log(`proved=${String(verdict.proved)}`);
	console.error(`proof-check: ${verdict.why}`);
	return 0;
};

if (import.meta.main) process.exit(main());
