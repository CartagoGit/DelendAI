/**
 * work-namespace.spec.ts — a work ref is a namespace the policy knows.
 *
 * Written against a real incident. `ref-lifecycle` failed on every pull
 * request into the integration branch because a branch under
 * `delendai/wip/<host>/<slice>` was classified `unmanaged`, and
 * `unmanaged` lands in `needsAttention`, which exits 1. Since that job
 * feeds the single required check, nothing could merge from any agent —
 * Claude, Codex, Copilot or a plain terminal.
 *
 * Two defects stacked underneath it:
 *
 *  1. `roleOf` tested `foreignRefPrefixes` and `publicationRefPrefix`
 *     and never `workRefPrefix`, so a work ref could only ever fall
 *     through to `unmanaged`.
 *  2. Even had it been tested, the prefix is declared fully qualified
 *     (`heads/delendai/wip/`) because the same value expands a work-ref
 *     template that `update-ref` must accept, while the forge reports
 *     short branch names (`delendai/wip/...`). The two spellings could
 *     never match.
 *
 * Each case below pins one of those, plus the namespace being the
 * operator's choice rather than delendai's name.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { reconcileRefs } from '@delendai/core/lib/ref-lifecycle/reconcile.service';

const policyFor = (namespacePrefix?: string) =>
	resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			integration: { requiredChecks: ['delendai-validate'] },
			...(namespacePrefix === undefined
				? {}
				: { branches: { namespacePrefix } }),
		},
	}).branches;

const verdictFor = (name: string, namespacePrefix?: string) =>
	reconcileRefs([{ name }], [], policyFor(namespacePrefix)).verdicts[0];

describe('work refs are a namespace the policy knows', () => {
	it('classifies a branch under the work namespace as work, not unmanaged', () => {
		expect(
			verdictFor('delendai/wip/agent-a/f1-s1-g1', 'delendai')?.role,
		).toBe('work');
	});

	it('matches a short forge name against a fully qualified prefix', () => {
		// The prefix is `heads/delendai/wip/`; the forge says
		// `delendai/wip/...`. Same namespace, two spellings.
		const branches = policyFor('delendai');
		expect(branches.workRefPrefix).toBe('heads/delendai/wip/');
		expect(verdictFor('delendai/wip/anything', 'delendai')?.role).toBe(
			'work',
		);
	});

	it('never offers a work ref for reaping and never fails the gate over it', () => {
		const result = reconcileRefs(
			[{ name: 'delendai/wip/agent-a/f1-s1-g1' }],
			[],
			policyFor('delendai'),
		);
		expect(result.reapable).toEqual([]);
		expect(result.needsAttention).toEqual([]);
		expect(result.active.map((v) => v.name)).toEqual([
			'delendai/wip/agent-a/f1-s1-g1',
		]);
	});

	it('still calls a branch outside every namespace what it is', () => {
		const verdict = verdictFor('feat/sqlite-revision-cas', 'delendai');
		expect(verdict?.role).toBe('unmanaged');
		// The remedy must name BOTH namespaces: an agent told only about
		// the publication one has nowhere to put work in progress.
		expect(verdict?.reason).toContain('delendai/wip/');
		expect(verdict?.reason).toContain('delendai/pr/');
	});

	it('defaults to a bare namespace, so a project does not inherit delendai’s name', () => {
		const branches = policyFor();
		expect(branches.namespacePrefix).toBe('');
		expect(branches.publicationRefPrefix).toBe('pr/');
		expect(branches.workRefPrefix).toBe('heads/wip/');
		expect(verdictFor('wip/agent-a/f1-s1-g1')?.role).toBe('work');
		expect(verdictFor('pr/some-slice')?.role).toBe('publication-unclaimed');
	});

	it('moves both namespaces together when the prefix changes', () => {
		// One knob. Two settings that must agree cannot drift apart.
		const branches = policyFor('acme');
		expect(branches.publicationRefPrefix).toBe('acme/pr/');
		expect(branches.workRefPrefix).toBe('heads/acme/wip/');
		expect(verdictFor('acme/wip/agent-a/f1-s1-g1', 'acme')?.role).toBe(
			'work',
		);
		expect(verdictFor('delendai/wip/agent-a/f1-s1-g1', 'acme')?.role).toBe(
			'unmanaged',
		);
	});

	it('keeps the work-ref template inside the namespace it advertises', () => {
		expect(policyFor('acme').workRefTemplate).toContain('heads/acme/wip/');
	});
});

describe('a work branch ends when it is published', () => {
	const branches = policyFor('delendai');

	it('calls a work ref whose content is already published work-published', () => {
		const result = reconcileRefs(
			[
				{
					name: 'delendai/wip/agent-a/f1-s1-g1-topic',
					publishedIn: 'delendai/pr/f1-topic',
				},
			],
			[],
			branches,
		);
		expect(result.verdicts[0]?.role).toBe('work-published');
		expect(result.verdicts[0]?.reason).toContain('delendai/pr/f1-topic');
	});

	it('keeps the branch of a proposal still in progress, published or not', () => {
		const result = reconcileRefs(
			[
				{
					name: 'delendai/wip/agent-a/f00001-S1-g1/topic',
					publishedIn: 'delendai/pr/agent-a/f00001-S1-g1/topic',
					proposalInProgress: true,
				},
			],
			[],
			branches,
		);
		expect(result.verdicts[0]?.role).toBe('work');
		expect(result.verdicts[0]?.reason).toContain('still in progress');
		expect(result.reapable).toEqual([]);
		expect(result.needsAttention).toEqual([]);
	});

	it('offers it for reaping and fails the gate until it is gone', () => {
		const result = reconcileRefs(
			[
				{
					name: 'delendai/wip/agent-a/f1-s1-g1-topic',
					publishedIn: 'develop',
				},
			],
			[],
			branches,
		);
		expect(result.reapable.map((v) => v.name)).toEqual([
			'delendai/wip/agent-a/f1-s1-g1-topic',
		]);
		expect(result.needsAttention.map((v) => v.name)).toEqual([
			'delendai/wip/agent-a/f1-s1-g1-topic',
		]);
		expect(result.active).toEqual([]);
	});

	it('leaves an unpublished work ref alone', () => {
		const result = reconcileRefs(
			[{ name: 'delendai/wip/agent-a/f1-s1-g1-topic' }],
			[],
			branches,
		);
		expect(result.verdicts[0]?.role).toBe('work');
		expect(result.reapable).toEqual([]);
		expect(result.needsAttention).toEqual([]);
	});

	it('ignores publishedIn on refs that are not work refs', () => {
		const result = reconcileRefs(
			[{ name: 'delendai/pr/f1-topic', publishedIn: 'develop' }],
			[{ number: 9, headRefName: 'delendai/pr/f1-topic', state: 'open' }],
			branches,
		);
		expect(result.verdicts[0]?.role).toBe('publication-open');
	});
});
