/**
 * former-namespace-readers.spec.ts — every reader of an existing ref
 * accepts every owned namespace, current and former (f00808 S8). This
 * repository writes `wip/`, `pr/` and `queue/` and still holds units,
 * publications and batches under `delendai/`.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import {
	branchesForRef,
	policyForRef,
} from '@delendai/core/lib/development-policy/owned-work-ref-parser';
import { formerPrefixPairs } from '@delendai/core/lib/integration/decisions/namespaces.helper';
import { proposalsHeldByUnits } from '@delendai/core/lib/work-units/in-progress-units.service';
import { workRefOfPublication } from '@delendai/core/lib/work-units/orphaned-work.service';
import { workRefOfPublicationRef } from '@delendai/core/lib/work-units/superseded-publication.service';
import { coordinationCostOf } from '@delendai/core/lib/work-units/coordination-cost.service';
import {
	planOwnedRetirement,
	retiredRefsOf,
} from '@delendai/core/lib/work-units/work-retire.service';
import { strayRefs } from '@delendai/core/lib/work-units/stray-refs.service';
import { mergedPublicationPredicate } from '@delendai/core/lib/startup-reconciler/phases/merged-publications.helper';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: {
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		},
	},
});
const { branches } = policy;

const FORMER_WORK = 'delendai/wip/agent-a/implement/x00001-S1-g1/t';
const FORMER_PUBLICATION = 'delendai/pr/agent-a/implement/x00001-S1-g1/t';
const CURRENT_WORK = 'wip/implement/agent-a/x00001-S1/t';
const CURRENT_PUBLICATION = 'pr/implement/agent-a/x00001-S1/t';

describe('the namespace a ref lives under decides how it is read', () => {
	it('[<5ms] pairs each former work prefix with its publication prefix', () => {
		expect(
			formerPrefixPairs(branches).map((pair) => [
				pair.workRefPrefix,
				pair.publicationRefPrefix,
			]),
		).toEqual([['heads/delendai/wip/', 'delendai/pr/']]);
	});

	it('[<5ms] gives a former unit its own branch settings, a current one the current', () => {
		expect(branchesForRef(branches, FORMER_WORK).namespacePrefix).toBe(
			'delendai',
		);
		expect(
			policyForRef(policy, CURRENT_WORK).branches.namespacePrefix,
		).toBe('');
	});

	it('[<5ms] maps a publication back to the work ref of its own namespace', () => {
		expect(workRefOfPublication(policy, FORMER_PUBLICATION)).toBe(
			FORMER_WORK,
		);
		expect(workRefOfPublication(policy, CURRENT_PUBLICATION)).toBe(
			CURRENT_WORK,
		);
		expect(workRefOfPublicationRef(policy, FORMER_PUBLICATION)).toBe(
			FORMER_WORK,
		);
	});

	it('[<5ms] holds a proposal for a unit or a publication of either namespace', () => {
		for (const name of [
			FORMER_WORK,
			FORMER_PUBLICATION,
			CURRENT_WORK,
			CURRENT_PUBLICATION,
		]) {
			expect([...proposalsHeldByUnits(policy, [name])]).toEqual([
				'x00001',
			]);
		}
	});

	it('[<5ms] plans the retirement of a former unit in its own names, keeping its tip under the current root', () => {
		const plan = planOwnedRetirement(branches, FORMER_PUBLICATION);
		expect(plan?.workBranch).toBe(FORMER_WORK);
		expect(plan?.publicationBranch).toBe(FORMER_PUBLICATION);
		expect(plan?.retiredRef.includes('delendai')).toBe(false);
		const kept = retiredRefsOf(branches, 'u');
		expect(kept).toHaveLength(2);
		expect(kept.every((ref) => ref.endsWith('/retired/u'))).toBe(true);
		expect(kept.some((ref) => ref.includes('delendai'))).toBe(true);
	});

	it('[<5ms] counts a merge of a former publication as landed work', () => {
		const log = `1 2\tMerge pull request #7 from Org/${FORMER_PUBLICATION}\n1 2\tMerge pull request #8 from Org/${CURRENT_PUBLICATION}`;
		expect(
			coordinationCostOf(log, 30, ['pr/', 'delendai/pr/']).landed,
		).toEqual({ units: 2, agents: 1 });
	});

	it('[<5ms] judges a work ref merged by either namespace’s publication', () => {
		const merged = mergedPublicationPredicate(
			[`Merge pull request #7 from Org/${FORMER_PUBLICATION}`],
			branches,
		);
		expect(merged(FORMER_WORK)).toBe(true);
		expect(merged(CURRENT_WORK)).toBe(false);
	});

	it('[<5ms] keeps the bookkeeping of every owned namespace out of the stray list', () => {
		const refs = ['', 'delendai'].flatMap((namespace) =>
			['retired/u', 'claims/slice/x/y'].map((kind) =>
				['refs', namespace, kind].filter(Boolean).join('/'),
			),
		);
		const stray = strayRefs({
			refs: [...refs, 'refs/elsewhere/z'],
			remotes: [],
			namespace: ['', 'delendai'],
		});
		// Retired work lives on the forge, so a local copy is stray; claims
		// are bookkeeping of the namespace and are not.
		expect(stray.some((ref) => ref.includes('claims'))).toBe(false);
		expect(stray.filter((ref) => ref.includes('retired'))).toHaveLength(2);
		expect(stray).toContain('refs/elsewhere/z');
	});
});
