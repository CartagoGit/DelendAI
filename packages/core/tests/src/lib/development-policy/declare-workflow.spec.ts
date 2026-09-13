/**
 * declare-workflow.spec.ts — the declaration must be DERIVED, complete
 * and unambiguous, in that order of importance.
 *
 * The failure this guards is an agent inferring a work model from the
 * repository it happens to find. Two projects on different profiles look
 * identical on disk, so a declaration that did not change with the
 * policy would be worse than none: it would be a confident wrong answer.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	declareWorkflow,
	renderWorkflowDeclaration,
} from '@delendai/core/lib/development-policy/declare-workflow';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import { deriveCapabilities } from '@delendai/core/lib/development-policy/derive';
import { DEVELOPMENT_PROFILES } from '@delendai/core/lib/development-policy/profiles';
import { repoRoot } from '../../../../../../tools/scripts/lib/repo-root';

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
	it('is actually printed by the shipped entry point', () => {
		// A declaration nothing prints is not a declaration. The wiring
		// is the load-bearing half of this feature — the module could be
		// perfect and every agent would still be guessing — so pin it
		// where a refactor that drops the call turns this red.
		const entry = readFileSync(
			join(repoRoot(), 'packages/core/src/lib/cli/run-cli.ts'),
			'utf8',
		);

		expect(entry).toContain('renderWorkflowDeclaration');
		expect(entry).toContain('declareWorkflow');
	});
});
