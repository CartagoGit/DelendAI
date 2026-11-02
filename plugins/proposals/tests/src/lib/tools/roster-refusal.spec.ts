/**
 * roster-refusal.spec.ts — with a roster declared, a review claim and a
 * verdict under a name that is not on it are refused, as entering a unit
 * already is, and the refusal names the roster and the nearest name.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { fakePartial } from '@delendai/test-kit';
import { createFakeToolServer } from '@delendai/test-kit/public';

import type { IAuthoringToolOptions } from '@delendai/proposals/lib/tools/authoring-options';
import { buildReviewRegistration } from '@delendai/proposals/lib/tools/authoring.tool';
import { buildReviewClaimRegistration } from '@delendai/proposals/lib/tools/review-claim.tool';

// A directory of its own, never the shared temporary directory itself.
const workspace = mkdtempSync(join(tmpdir(), 'roster-refusal-'));

const options = fakePartial<
	IAuthoringToolOptions,
	| 'namespacePrefix'
	| 'developmentPolicy'
	| 'workspaceRoot'
	| 'proposalsDirAbs'
>({
	namespacePrefix: 'x',
	workspaceRoot: workspace,
	proposalsDirAbs: join(workspace, 'proposals'),
	developmentPolicy: resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: { namespacePrefix: 'delendai' },
			coordination: { roster: ['minimax-m3.1', 'glm-5.3-flash'] },
		},
	}),
});

const handlerOf = async (
	registration: ReturnType<typeof buildReviewClaimRegistration>,
): Promise<(args: unknown) => Promise<unknown>> => {
	let found: ((args: unknown) => Promise<unknown>) | undefined;
	await registration.register(
		createFakeToolServer({
			onRegisterTool: ({ handler }) => {
				found = handler as (args: unknown) => Promise<unknown>;
			},
		}),
	);
	if (found === undefined) throw new Error('no handler registered');
	return found;
};

const text = (result: unknown): string => JSON.stringify(result);

describe('a name off the roster', () => {
	it('claims nothing, and is pointed at its roster name', async () => {
		const claim = await handlerOf(buildReviewClaimRegistration(options));
		const result = text(
			await claim({ proposalId: 'x00001', agent: 'minimax-3.1' }),
		);
		expect(result).toContain('No claim under');
		expect(result).toContain('minimax-m3.1');
	});

	it('records no verdict, approval or change request', async () => {
		const review = await handlerOf(buildReviewRegistration(options));
		for (const action of ['approve', 'request_changes'] as const) {
			const result = text(
				await review({
					proposalId: 'x00001',
					sliceId: 'S1',
					action,
					agent: 'glm-5.3-max',
					note: 'n',
				}),
			);
			expect(result).toContain('No verdict under');
			expect(result).toContain('glm-5.3-flash');
		}
	});
});
