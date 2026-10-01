#!/usr/bin/env bun

/**
 * refuse-integration-commit — a commit onto the integration branch is
 * impossible while the policy forbids one, whoever is trying.
 *
 * WHY A HOOK AND NOT A CODE PATH: the policy already says
 * `allowsDirectIntegrationCommit: false`, the persistence port already
 * refuses, and commits onto `develop` happened anyway — twice, one
 * minute after the WIP route had correctly refused the same work. I
 * could not identify which path produced them, and a fix applied to the
 * path I *think* did it would protect against the one case I already
 * understand.
 *
 * A hook does not need to know. Every commit in this repository goes
 * through it: this plugin's engine, another agent's tooling, a human
 * with a terminal, an editor's source-control button. For a swarm of
 * fifteen agents that difference is the whole point — the guarantee has
 * to hold for the agents whose code nobody here has read.
 *
 * WHAT IT DOES NOT DO: it never decides what the policy is. It reads
 * the project's own `development` block, and when there is no policy,
 * or the policy permits direct commits, it stands aside. A project on
 * `shared-direct` is unaffected. So is a merge commit — those are how
 * an integration branch legitimately moves.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { repoRoot } from '../lib/repo-root';

import type { IIntegrationCommitVerdict } from './refuse-integration-commit.interface';

export type { IIntegrationCommitVerdict } from './refuse-integration-commit.interface';

/**
 * The decision, from facts alone.
 *
 * Pure so the one case that must never regress — "policy forbids it and
 * HEAD is the integration branch" — is pinned by a test rather than by
 * whether anyone remembers to try it.
 */
export const judgeIntegrationCommit = (input: {
	readonly branch: string | undefined;
	readonly integration: string | undefined;
	readonly allowsDirectIntegrationCommit: boolean;
	readonly isMerge: boolean;
}): IIntegrationCommitVerdict => {
	if (input.allowsDirectIntegrationCommit) {
		return {
			refused: false,
			reason: 'the policy allows direct integration commits.',
		};
	}
	if (input.integration === undefined) {
		return {
			refused: false,
			reason: 'no integration branch is declared, so there is nothing to protect.',
		};
	}
	if (input.branch !== input.integration) {
		return {
			refused: false,
			reason: `the checkout is on ${input.branch ?? '(detached)'}, not on ${input.integration}.`,
		};
	}
	if (input.isMerge) {
		return {
			refused: false,
			reason: 'a merge is how the integration branch legitimately moves.',
		};
	}
	return {
		refused: true,
		reason: `the development policy routes work to publication refs, so nothing may be committed onto ${input.integration} directly.`,
	};
};

const git = (args: readonly string[]): string => {
	try {
		return execFileSync('git', [...args], {
			cwd: repoRoot(),
			encoding: 'utf8',
		}).trim();
	} catch {
		return '';
	}
};

/**
 * The project's declared policy, RESOLVED — not re-read.
 *
 * The first version of this hook parsed `delendai.config.json` and
 * decided for itself what the profile meant
 * (`profile === 'shared-direct'`). That is a second implementation of
 * the policy's semantics, in a file whose whole purpose is to enforce
 * the first one — the same duplication that let a config contradict its
 * own profile for weeks.
 *
 * Imported through `@delendai/core/public` because `lint:cli-imports`
 * allows no other door into core, and that boundary is worth more than
 * the cost: 370ms from cold against 20ms for a deep import straight at
 * the resolver. A third of a second per commit, to stop this file from
 * being a second opinion about what a profile means.
 */
const readPolicy = (): {
	readonly integration: string | undefined;
	readonly allows: boolean;
} => {
	const path = join(repoRoot(), 'delendai.config.json');
	if (!existsSync(path)) return { integration: undefined, allows: true };
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
			readonly development?: Record<string, unknown>;
		};
		if (parsed.development === undefined) {
			return { integration: undefined, allows: true };
		}
		const policy = resolveDevelopmentPolicy({
			development: parsed.development as never,
		});
		return {
			integration: policy.branches.integration,
			allows: policy.persistence.allowsDirectIntegrationCommit,
		};
	} catch {
		// An unreadable or unresolvable config is not permission.
		return { integration: 'develop', allows: false };
	}
};

const main = (): number => {
	const policy = readPolicy();
	const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
	const verdict = judgeIntegrationCommit({
		branch: branch.length > 0 ? branch : undefined,
		integration: policy.integration,
		allowsDirectIntegrationCommit: policy.allows,
		// `MERGE_HEAD` exists only while a merge is being concluded.
		isMerge: existsSync(join(repoRoot(), '.git', 'MERGE_HEAD')),
	});

	if (!verdict.refused) return 0;

	console.error(
		[
			'',
			`  Refused: a commit onto ${policy.integration}.`,
			'',
			`  ${verdict.reason}`,
			'',
			'  Work reaches the integration branch through a publication ref and',
			'  the forge, never through a local commit — that is what keeps two',
			'  agents in one checkout from overwriting each other.',
			'',
			'  If you are certain this one is right, LEFTHOOK=0 git commit … says so',
			'  explicitly. Nothing here silently decides it for you.',
			'',
		].join('\n'),
	);
	return 1;
};

if (import.meta.main) process.exit(main());
