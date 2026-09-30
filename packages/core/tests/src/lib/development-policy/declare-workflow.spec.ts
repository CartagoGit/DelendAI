/**
 * declare-workflow.spec.ts — the declaration must be DERIVED, complete
 * and unambiguous, in that order of importance.
 *
 * The failure this guards is an agent inferring a work model from the
 * repository it happens to find. Two projects on different profiles look
 * identical on disk, so a declaration that did not change with the
 * policy would be worse than none: it would be a confident wrong answer.
 */

import { describe, expect, it } from 'vitest';

import {
	briefWorkModel,
	declareWorkflow,
	renderWorkflowDeclaration,
	workModelInstructionLines,
	workModelNextStep,
	workModelSummary,
} from '@delendai/core/lib/development-policy/declare-workflow';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import { deriveCapabilities } from '@delendai/core/lib/development-policy/derive';
import { DEVELOPMENT_PROFILES } from '@delendai/core/lib/development-policy/profiles';

const policyFor = (profile: (typeof DEVELOPMENT_PROFILES)[number]) =>
	deriveCapabilities(expandProfile(profile));

describe('declareWorkflow', () => {
	it('declares every profile without omitting a step', () => {
		for (const profile of DEVELOPMENT_PROFILES) {
			const declaration = declareWorkflow(policyFor(profile));

			// Fixed length and order across every policy: a reader
			// comparing two projects compares the same positions.
			expect(declaration.steps).toHaveLength(8);
			expect(declaration.steps.map((step) => step.order)).toEqual([
				1, 2, 3, 4, 5, 6, 7, 8,
			]);
			for (const step of declaration.steps) {
				expect(step.instruction.length).toBeGreaterThan(0);
				// Every sentence names the field it came from, so the
				// claim is auditable instead of merely confident.
				expect(step.derivedFrom).toMatch(/^[a-z]+\./u);
			}
		}
	});

	it('says something DIFFERENT for profiles that work differently', () => {
		const rendered = DEVELOPMENT_PROFILES.map((profile) =>
			renderWorkflowDeclaration(declareWorkflow(policyFor(profile))),
		);

		// If two profiles rendered the same text, one of them would be
		// telling its agents to work the way the other one works.
		expect(new Set(rendered).size).toBe(rendered.length);
	});

	it('names the branch the work actually targets, not a convention', () => {
		const base = expandProfile('shared-checkout-pr');
		const policy = deriveCapabilities({
			...base,
			branches: {
				...base.branches,
				integration: 'trunk',
				release: 'ship',
			},
		});
		const declaration = declareWorkflow(policy);

		expect(declaration.integrationBranch).toBe('trunk');
		expect(declaration.releaseBranch).toBe('ship');
		expect(renderWorkflowDeclaration(declaration)).toContain('trunk');
		expect(renderWorkflowDeclaration(declaration)).not.toContain('develop');
	});

	it('states what the merge method does to the commits, both ways', () => {
		const base = expandProfile('shared-checkout-pr');
		const squashed = renderWorkflowDeclaration(
			declareWorkflow(
				deriveCapabilities({
					...base,
					integration: { ...base.integration, mergeMethod: 'squash' },
				}),
			),
		);
		const merged = renderWorkflowDeclaration(
			declareWorkflow(
				deriveCapabilities({
					...base,
					integration: { ...base.integration, mergeMethod: 'merge' },
				}),
			),
		);

		// The consequence an operator discovers too late must be stated
		// up front, in the word that matters.
		expect(squashed).toContain('DISCARDED');
		expect(merged).toContain('survive');
	});

	it('refuses to describe a config with no way to persist work', () => {
		const base = expandProfile('shared-checkout-pr');
		const policy = deriveCapabilities({
			...base,
			branches: { ...base.branches, workRefTemplate: '' },
		});

		// Not an omission and not a plausible-sounding default: a policy
		// that cannot persist has to SAY so, where an agent will read it.
		expect(renderWorkflowDeclaration(declareWorkflow(policy))).toContain(
			'STOP',
		);
	});
	it('renders in the shape the server writes to stderr', () => {
		// The entry point prints this verbatim, so the prefix is part of
		// the contract: an operator greps `[delendai]` to find it among
		// whatever else the host is writing to the same stream.
		const text = renderWorkflowDeclaration(
			declareWorkflow(policyFor('shared-checkout-pr')),
		);

		expect(
			text.split('\n').every((line) => line.startsWith('[delendai]')),
		).toBe(true);
		expect(text).toContain('work model: shared-checkout-pr');
	});
	it('gives every built-in profile a way to persist work', () => {
		// `worktree-pr` persists on a branch, which the route table did
		// not know, so its own declaration told its agents to STOP.
		for (const profile of DEVELOPMENT_PROFILES) {
			expect(
				renderWorkflowDeclaration(declareWorkflow(policyFor(profile))),
			).not.toContain('STOP');
		}
	});

	it('does not forbid committing to the branch a direct profile commits to', () => {
		const text = renderWorkflowDeclaration(
			declareWorkflow(policyFor('shared-direct')),
		);

		expect(text).toContain('Commit your work directly to develop');
		expect(text).not.toContain('never commit to it');
	});

	it('states how work starts and lands, per profile', () => {
		const merge = briefWorkModel(policyFor('shared-checkout-merge'));
		const pr = briefWorkModel(policyFor('shared-checkout-pr'));
		const direct = briefWorkModel(policyFor('shared-direct'));

		expect(merge.start).toContain('delendai work enter');
		expect(merge.start).toContain('delendai work checkpoint');
		expect(merge.land).toContain('MERGING it into develop');
		expect(merge.land).toContain('opens no pull request');
		expect(merge.land).toContain('validation gate');
		// The route it names is the command that lands.
		expect(merge.land).toContain('`delendai work publish --proposal=<id>');
		expect(merge.land).toContain('Never merge or push to develop by hand');

		expect(pr.start).toBe(merge.start);
		expect(pr.land).toContain('opens a pull request into develop');
		expect(pr.land).toContain('delendai work publish');

		expect(direct.start).not.toContain('work enter');
		expect(direct.land).toContain('no pull request');
	});

	it('summarises each profile in one line, from the same axes', () => {
		expect(workModelSummary(policyFor('shared-checkout-merge'))).toBe(
			'shared-checkout-merge: start with `delendai work enter`; land by merge into develop with `delendai work publish`, after the local gate, no pull request.',
		);
		expect(workModelSummary(policyFor('shared-checkout-pr'))).toContain(
			'land by pull request into develop',
		);
		expect(workModelSummary(policyFor('shared-direct'))).toContain(
			'commit on develop',
		);
		expect(workModelSummary(policyFor('worktree-pr'))).toContain(
			'worktree branch',
		);
	});

	it('says who certifies and when the work ref ends, per strategy', () => {
		const merge = declareWorkflow(policyFor('shared-checkout-merge'));
		const pr = declareWorkflow(policyFor('shared-checkout-pr'));
		const step = (
			declaration: ReturnType<typeof declareWorkflow>,
			axis: string,
		) =>
			declaration.steps.find((entry) => entry.derivedFrom === axis)
				?.instruction ?? '';

		expect(step(merge, 'integration.requiresLocalCertification')).toContain(
			'`delendai work publish` runs the validation gate',
		);
		expect(step(merge, 'integration.deleteMergedWorkRef')).toContain(
			'once its work has landed',
		);
		expect(step(pr, 'integration.requiresLocalCertification')).toContain(
			'Prove the candidate in isolation BEFORE',
		);
		expect(
			step(
				declareWorkflow(policyFor('worktree-pr')),
				'integration.requiresLocalCertification',
			),
		).toContain('Certification happens on the forge');
		expect(step(pr, 'integration.deleteMergedWorkRef')).toContain(
			'outlives its pull requests',
		);
	});

	it('names the profile in the next step a refusal gives', () => {
		const next = workModelNextStep(policyFor('shared-checkout-merge'));

		expect(next).toContain('`shared-checkout-merge`');
		expect(next).toContain('MERGING');
	});

	it('renders the instruction lines from the same declaration', () => {
		const policy = policyFor('shared-checkout-pr');
		const lines = workModelInstructionLines(policy);

		expect(lines[0]).toContain('overrides any document');
		expect(lines.slice(1)).toEqual(
			declareWorkflow(policy).steps.map(
				(step) => `${step.order}. ${step.instruction}`,
			),
		);
	});

	it('separates following the branch from performing a merge in it', () => {
		// The first wording said "never switch, merge, rebase or reset",
		// which reads as "merging is discouraged" — and merging is the
		// MODEL, not a hazard. What must never happen is a merge run in
		// the shared tree: that moves HEAD and rewrites files the other
		// agents are editing, which is exactly why the engine builds one
		// in a throwaway index instead.
		const text = renderWorkflowDeclaration(
			declareWorkflow(policyFor('shared-checkout-pr')),
		);

		expect(text).toContain('only ever FOLLOWS');
		expect(text).toContain('never commit to it');
		// Merging named as the normal route, not as something to avoid.
		expect(text).toContain('Merging is how work lands');
		expect(text).toContain('throwaway index');
	});
});

describe('no sentence names a mechanism the profile does not have', () => {
	const textOf = (profile: (typeof DEVELOPMENT_PROFILES)[number]) =>
		declareWorkflow(policyFor(profile))
			.steps.map((step) => step.instruction)
			.join('\n');
	/** "opens no pull request" is a denial, not a mechanism. */
	const withoutDenials = (text: string) =>
		text.replaceAll(/\bno pull request\b/giu, '');

	it.each(['shared-checkout-merge', 'shared-direct'] as const)(
		'%s never mentions a pull request or forge certification',
		(profile) => {
			const text = withoutDenials(textOf(profile));

			expect(text).not.toMatch(/pull request/iu);
			expect(text).not.toMatch(/on the forge/iu);
		},
	);

	it('shared-direct neither squashes, discards nor has a work ref to end', () => {
		const text = textOf('shared-direct');

		expect(text).not.toMatch(/squash|discard|rebased|merge commit/iu);
		expect(text).toContain('There is no work ref');
		expect(text).toContain('nothing gates a commit');
		expect(text).not.toContain('preserves it');
	});

	it('shared-checkout-merge is certified by the local gate, not the forge', () => {
		const text = textOf('shared-checkout-merge');

		expect(text).toContain('validation gate');
		expect(text).not.toContain('Certification happens on the forge');
		expect(text).toContain('merge commit');
	});

	it('shared-checkout-pr certifies on the machine, as its preset declares', () => {
		const text = textOf('shared-checkout-pr');

		expect(text).toContain('Prove the candidate in isolation BEFORE');
		expect(text).not.toContain('Certification happens on the forge');
	});

	it('worktree-pr keeps its forge and pull-request wording', () => {
		const text = textOf('worktree-pr');

		expect(text).toContain('Certification happens on the forge');
		expect(text).toContain('pull request');
	});

	it('states a recovery promise only where recovery exists', () => {
		for (const profile of DEVELOPMENT_PROFILES) {
			const policy = policyFor(profile);
			const text = textOf(profile);

			expect(text.includes('reconciliation preserves')).toBe(
				policy.recovery.strategy !== 'none',
			);
		}
	});
});
