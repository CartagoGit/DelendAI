#!/usr/bin/env bun

/**
 * namespace-ruleset-guard — the forge's branch-name rule must be the
 * one the policy derives.
 *
 * A ruleset is the only mechanism here that REFUSES rather than reports:
 * `lint:ref-lifecycle` classifies refs after they exist, which is right
 * for "this ref no longer has a pull request" and useless for "this ref
 * should never have been created". Twice, branches appeared under
 * `agent/*` and `wip/*` with that guard already in the repository,
 * because a report is not a refusal.
 *
 * The cost of a refusal living on the forge is that nobody can read it
 * from the repository, and an unreadable rule drifts — the whole finding
 * of ADR 0020. So the rule is DERIVED from the development policy and
 * this guard compares the live one against that derivation.
 *
 * `--sync` writes the derivation to the forge. Without it the guard only
 * reports, because silently rewriting a repository's rules from CI is a
 * larger authority than a lint should hold.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

import { namespaceRuleset } from '../governance/forge-settings.lib';
import { repoRoot } from '../lib/monorepo-paths';

const SYNC = process.argv.includes('--sync');
const RULESET_NAME = 'branch-namespace';

const slug = (): string => {
	const fromEnv = process.env.GITHUB_REPOSITORY;
	if (fromEnv?.includes('/') === true) return fromEnv;
	const url = execFileSync('git', ['remote', 'get-url', 'origin'], {
		encoding: 'utf8',
	}).trim();
	const match = /[/:]([^/:]+\/[^/]+?)(?:\.git)?$/u.exec(url);
	if (match?.[1] === undefined) {
		throw new Error(
			`namespace-ruleset-guard: could not tell which repository this is from origin (${url}). Set GITHUB_REPOSITORY.`,
		);
	}
	return match[1];
};

const gh = (args: readonly string[], stdin?: string): string =>
	execFileSync('gh', [...args], {
		encoding: 'utf8',
		maxBuffer: 16 * 1024 * 1024,
		...(stdin === undefined ? {} : { input: stdin }),
	});

const desired = (): Readonly<Record<string, unknown>> => {
	const config = JSON.parse(
		readFileSync(join(repoRoot(), 'delendai.config.json'), 'utf8'),
	) as { readonly development?: Record<string, unknown> };
	return namespaceRuleset(
		resolveDevelopmentPolicy(
			config.development === undefined
				? {}
				: { development: config.development },
		),
	);
};

interface ILiveRuleset {
	readonly id: number;
	readonly name: string;
	readonly enforcement: string;
	readonly conditions?: {
		readonly ref_name?: { readonly exclude?: readonly string[] };
	};
	readonly rules?: readonly { readonly type: string }[];
}

const main = (): number => {
	const repository = slug();
	const want = desired();
	const wantExclude =
		(
			want['conditions'] as {
				ref_name: { exclude: readonly string[] };
			}
		).ref_name.exclude ?? [];

	const list = JSON.parse(
		gh(['api', `repos/${repository}/rulesets`]),
	) as readonly ILiveRuleset[];
	const summary = list.find((entry) => entry.name === RULESET_NAME);

	if (summary === undefined) {
		if (!SYNC) {
			console.error(
				`✖ namespace-ruleset-guard: the forge has no \`${RULESET_NAME}\` ruleset, so nothing refuses a branch created outside the policy's namespaces.\n` +
					'  Run this script with --sync to create it from the policy.',
			);
			return 1;
		}
		gh(
			[
				'api',
				'-X',
				'POST',
				`repos/${repository}/rulesets`,
				'--input',
				'-',
			],
			JSON.stringify(want),
		);
		console.log(
			`namespace-ruleset-guard: created \`${RULESET_NAME}\` from the policy.`,
		);
		return 0;
	}

	// The list endpoint omits conditions; the single-ruleset one carries them.
	const live = JSON.parse(
		gh(['api', `repos/${repository}/rulesets/${String(summary.id)}`]),
	) as ILiveRuleset;

	const liveExclude = [...(live.conditions?.ref_name?.exclude ?? [])].sort();
	const missing = [...wantExclude]
		.sort()
		.filter((x) => !liveExclude.includes(x));
	const extra = liveExclude.filter((x) => ![...wantExclude].includes(x));
	const blocksCreation =
		live.rules?.some((rule) => rule.type === 'creation') === true;
	const active = live.enforcement === 'active';

	const problems: string[] = [];
	if (!active) {
		problems.push(
			`  enforcement is \`${live.enforcement}\` — a rule that does not enforce refuses nothing.`,
		);
	}
	if (!blocksCreation) {
		problems.push(
			'  no `creation` rule — the ruleset exists but permits the branch it was written to prevent.',
		);
	}
	if (missing.length > 0) {
		problems.push(
			`  the forge allows namespaces the policy does not: it is MISSING these exclusions, so it would refuse them: ${missing.join(', ')}`,
		);
	}
	if (extra.length > 0) {
		problems.push(
			`  the forge excludes namespaces the policy does not name: ${extra.join(', ')}`,
		);
	}

	if (problems.length === 0) {
		console.log(
			`✓ namespace-ruleset-guard: the live \`${RULESET_NAME}\` ruleset matches the policy (${String(wantExclude.length)} allowed namespaces, creation refused elsewhere).`,
		);
		return 0;
	}

	if (SYNC) {
		gh(
			[
				'api',
				'-X',
				'PUT',
				`repos/${repository}/rulesets/${String(summary.id)}`,
				'--input',
				'-',
			],
			JSON.stringify(want),
		);
		console.log(
			`namespace-ruleset-guard: synced \`${RULESET_NAME}\` to the policy.`,
		);
		return 0;
	}

	console.error(
		`✖ namespace-ruleset-guard: the live ruleset disagrees with the policy:\n${problems.join('\n')}\n\n` +
			'  The policy is the source. Run with --sync to bring the forge to it,\n' +
			'  or change `development.branches` if the forge is right.',
	);
	return 1;
};

process.exit(main());
