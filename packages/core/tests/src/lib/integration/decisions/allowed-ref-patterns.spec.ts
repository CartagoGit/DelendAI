/**
 * Every ref namespace land or work creates must match what the forge
 * ruleset admits (`allowedRefPatterns`), for the default policy and for
 * this repository's own: a branch the ruleset declines (GH013) stops the
 * flow that pushes it, as the repair prefix once did.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import {
	allowedRefPatterns,
	ownedBatchPrefixes,
	ownedPublicationRefPrefixes,
	ownedRehearsalPrefixes,
	ownedWorkRefPrefixes,
} from '@delendai/core/lib/integration/decisions/namespaces.helper';
import { refOf } from '@delendai/core/lib/integration/land/land-batch-record.helper';
import {
	landRepairPrefix,
	repairBranch,
} from '@delendai/core/lib/integration/land/land-revert.helper';

/** GitHub's fnmatch: `**` crosses `/`, `**` + `/` may match nothing, `*` stays in one segment. */
const globMatches = (pattern: string, ref: string): boolean =>
	new RegExp(
		`^${pattern.replace(/\*\*\/|\*\*|\*|[.+^${}()|[\]\\]/gu, (token) =>
			token === '**/'
				? '(?:.*/)?'
				: token === '**'
					? '.*'
					: token === '*'
						? '[^/]*'
						: `\\${token}`,
		)}$`,
		'u',
	).test(ref);

const repoConfig = JSON.parse(
	readFileSync(
		resolve(__dirname, '../../../../../../../delendai.config.json'),
		'utf8',
	),
) as { development?: unknown };

const policies = {
	default: resolveDevelopmentPolicy({}),
	repository: resolveDevelopmentPolicy(
		repoConfig as Parameters<typeof resolveDevelopmentPolicy>[0],
	),
};

describe.each(Object.entries(policies))(
	'refs created under the %s policy',
	(_name, policy) => {
		const { branches } = policy;
		const patterns = allowedRefPatterns(policy);
		const [batchPrefix = ''] = ownedBatchPrefixes(branches);
		const strip = (prefix: string): string =>
			prefix.replace(/^heads\//u, '');
		const created: Record<string, string> = {
			work: `${strip(ownedWorkRefPrefixes(branches)[0] ?? '')}claude-x/implement/x00001-S1-g1/topic`,
			publication: `${ownedPublicationRefPrefixes(branches)[0] ?? ''}claude-x/implement/x00001-S1-g1/topic`,
			batch: refOf(batchPrefix, [1, 2]),
			repair: repairBranch(landRepairPrefix(batchPrefix), 3170),
			rehearsal: `${ownedRehearsalPrefixes(branches)[0] ?? ''}run-1/head`,
		};

		it('[<10ms] a repair ref is not mistaken for a batch', () => {
			expect(created.repair?.startsWith(`${batchPrefix}batch-`)).toBe(
				false,
			);
		});

		it.each(Object.entries(created))(
			'[<10ms] the ruleset admits a %s ref',
			(_kind, ref) => {
				expect(
					patterns.some((pattern) =>
						globMatches(pattern, `refs/heads/${ref}`),
					),
				).toBe(true);
			},
		);
	},
);
