#!/usr/bin/env bun
/**
 * publication-proof-gate.script.ts — prove a candidate before the forge
 * spends a matrix on it.
 *
 * WHY this exists, measured rather than supposed: of the candidate runs
 * that failed on this repository, the causes were `typecheck` (an
 * `exactOptionalPropertyTypes` violation in a new spec) and
 * `lint-governance` (a deleted workflow still cited by five closed
 * proposals, with the ratchet baseline not updated alongside). Both are
 * decidable on the machine that wrote the change, in seconds, with no
 * network. Instead each one cost a full CI matrix, a human reading the
 * log, a fix, and a second matrix — and the author of the change was
 * the last person who could have caught it cheaply.
 *
 * So: a push to a publication ref runs those checks first. This is
 * deliberately the SLOWER path per push and the faster path to a merged
 * pull request, which is the only number that matters.
 *
 * WHY NOT simply "run CI locally": CI also runs jobs that need the
 * forge, the network, or a clean runner, and a gate that cannot finish
 * is a gate people bypass. What runs here is the subset that is
 * deterministic, offline, and has actually failed a candidate. It is a
 * pre-flight, not a mirror, and the header says so rather than letting
 * the name imply otherwise.
 *
 * WHY the prefix comes from the policy and not from the config file:
 * reading `delendai.config.json` directly gives a tool its own opinion
 * about what a publication ref is, and the resolved policy's default
 * (`delendai/pr/`) is narrower than the raw config suggests. One
 * resolver, one answer — the same correction already applied to the
 * integration-commit hook.
 *
 * WHAT THIS PROVES, exactly: the checks run against the CHECKOUT, not
 * against the commit object being pushed. In the shared-checkout model
 * those are the same tree — the agent proves what it just wrote. They
 * come apart when a candidate is published by plumbing from a tree that
 * no longer holds it, so the gate says so out loud instead of implying
 * a guarantee it cannot give. Closing that gap for real is the
 * candidate-identity receipt, not a louder claim here.
 *
 * Bypass: LEFTHOOK_BYPASS=1 git push … — for a human in a hurry. An
 * agent that sets it is defeating the only check standing between a
 * broken candidate and a wasted matrix.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { isLefthookBypassed } from '../lib/lefthook-bypass';
import { repoRoot } from '../lib/monorepo-paths';
import {
	parsePrePushStdin,
	type IPrePushRefUpdate,
} from './push-to-develop-discipline.script';
import type {
	IProofStep,
	IProofGateDecision,
} from './publication-proof-gate.interface';

const REFS_HEADS_PREFIX = 'refs/heads/';

/**
 * The pre-flight, in the order that fails fastest for the least money.
 * `typecheck` is last because it is by far the slowest, and a candidate
 * that fails a four-second lint should not wait ninety seconds to hear
 * about it.
 */
export const PROOF_STEPS: readonly IProofStep[] = [
	{
		script: 'format:all:check',
		because: 'develop has gone red on formatting alone',
	},
	{
		script: 'lint',
		because: 'biome findings block every candidate the same way',
	},
	{
		script: 'lint:proposals',
		because:
			'deleting a cited file needs its ratchet baseline updated in the same change',
	},
	{
		script: 'lint:publication-scope',
		because:
			'a host artifact in a candidate breaks every install downstream',
	},
	{
		script: 'lint:architecture',
		because:
			'seventeen lints in nine seconds, and the same script CI runs; `types-in-contracts` failed a candidate that had passed everything else here',
	},
	{
		script: 'typecheck',
		because:
			'the slowest check, and the one that has actually failed candidates',
	},
];

const stripRefs = (ref: string): string =>
	ref.startsWith(REFS_HEADS_PREFIX)
		? ref.slice(REFS_HEADS_PREFIX.length)
		: ref;

const isDelete = (update: IPrePushRefUpdate): boolean =>
	/^0+$/u.test(update.localSha);

/** The publication prefix as the resolved policy defines it. */
export const publicationPrefix = (): string => {
	const config = JSON.parse(
		readFileSync(join(repoRoot(), 'delendai.config.json'), 'utf8'),
	) as { readonly development?: Record<string, unknown> };
	return resolveDevelopmentPolicy({
		...(config.development === undefined
			? {}
			: { development: config.development }),
	}).branches.publicationRefPrefix;
};

/**
 * Which of these ref updates are publications. Pure, so the decision is
 * testable without a git push.
 */
export const publicationsAmong = (
	updates: readonly IPrePushRefUpdate[],
	prefix: string,
): readonly string[] => {
	if (prefix === '') return [];
	return updates
		.filter((update) => !isDelete(update))
		.map((update) => stripRefs(update.remoteRef))
		.filter((ref) => ref.startsWith(prefix));
};

/**
 * Whether the checkout still holds what is being pushed. A mismatch is
 * not an error — publishing by plumbing is a legitimate path — but the
 * operator must know the proof below covers a different tree.
 */
export const checkoutMatches = (
	pushedSha: string,
	diff: (sha: string) => string = (sha) =>
		spawnSync('git', ['diff', '--name-only', sha], {
			encoding: 'utf8',
		}).stdout ?? '',
): boolean => diff(pushedSha).trim() === '';

const defaultRunStep = (script: string): number =>
	spawnSync('bun', ['run', script], { stdio: 'inherit' }).status ?? 1;

/** Run the pre-flight over the refs being published. Side effects injected. */
export const decideProofGate = (
	publications: readonly string[],
	runStep: (script: string) => number = defaultRunStep,
	steps: readonly IProofStep[] = PROOF_STEPS,
): IProofGateDecision => {
	if (publications.length === 0) {
		return { ok: true, publications: [], failed: [] };
	}
	const failed: string[] = [];
	for (const step of steps) {
		if (runStep(step.script) !== 0) failed.push(step.script);
	}
	return { ok: failed.length === 0, publications, failed };
};

const report = (decision: IProofGateDecision): string => {
	if (decision.publications.length === 0) {
		return '✓ publication-proof: nothing published by this push\n';
	}
	if (decision.ok) {
		return `✓ publication-proof: ${decision.publications.join(', ')} proved locally\n`;
	}
	return [
		'✗ publication-proof: this candidate would fail CI.',
		'',
		...decision.failed.map((script) => `  bun run ${script}`),
		'',
		'next-action:',
		'  run the commands above, fix what they report, and push again.',
		'  Pushing it anyway costs a full CI matrix and a review to learn',
		'  what these seconds already told you.',
		'',
	].join('\n');
};

export const main = async (): Promise<number> => {
	if (isLefthookBypassed()) {
		process.stdout.write(
			'✓ publication-proof: bypassed (LEFTHOOK_BYPASS=1)\n',
		);
		return 0;
	}
	if (process.stdin.isTTY) return 0;
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	const updates = parsePrePushStdin(chunks.join(''));
	const publications = publicationsAmong(updates, publicationPrefix());
	const pushed = updates.find(
		(u) => stripRefs(u.remoteRef) === publications[0],
	);
	if (
		publications.length > 0 &&
		pushed !== undefined &&
		!checkoutMatches(pushed.localSha)
	) {
		process.stdout.write(
			'publication-proof: the checkout is not the tree being pushed — what follows proves the checkout.\n',
		);
	}
	const decision = decideProofGate(publications);
	if (decision.ok) {
		process.stdout.write(report(decision));
		return 0;
	}
	process.stderr.write(report(decision));
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
