/**
 * integration-missing.spec.ts — a policy naming a branch that is gone.
 *
 * An adopter project kept `branches.integration` pointed at a feature
 * branch after merging it into `develop` and deleting it. Startup said
 * "HEAD is on develop instead of the integration branch", which sends an
 * agent after a branch it cannot check out. Against real clones of a bare
 * origin, because the question is what git can resolve.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { runCheckoutPhase } from '@delendai/core/lib/startup-reconciler/phases/verify-checkout';

import { createStartupOrigin, type IStartupOrigin } from './startup-workspace';

let origin: IStartupOrigin | undefined;
afterEach(() => {
	origin?.cleanup();
	origin = undefined;
});

const policyIntegratingInto = (integration: string) =>
	resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-merge',
			branches: { integration, release: 'main' },
		},
	});

describe('a configured integration branch that no longer exists', () => {
	it('is reported as missing configuration, not as HEAD having moved', async () => {
		origin = createStartupOrigin();
		const clone = origin.clone('merged-and-deleted');

		const result = await runCheckoutPhase({
			git: clone.seam,
			policy: policyIntegratingInto(
				'feat/migracion-completa-resto-pantallas',
			),
			refs: [],
		});

		expect(result.findings.map((f) => f.code)).toEqual([
			'checkout.integration-missing',
		]);
		const [missing] = result.findings;
		expect(missing?.kind).toBe('blocker');
		expect(missing?.message).toContain(
			'`feat/migracion-completa-resto-pantallas` does not exist locally or on its remote',
		);
		expect(missing?.message).toContain('development.branches.integration');
		expect(missing?.message).toContain('`develop`');
	});

	it('still reports HEAD moved when the branch exists only on origin', async () => {
		origin = createStartupOrigin();
		const publisher = origin.clone('publisher');
		publisher.git('switch', '--quiet', '-c', 'feat/integration');
		publisher.push('feat/integration');
		const clone = origin.clone('reader');

		const result = await runCheckoutPhase({
			git: clone.seam,
			policy: policyIntegratingInto('feat/integration'),
			refs: [],
		});

		expect(result.findings.map((f) => f.code)).toEqual([
			'checkout.head-moved',
		]);
	});
});
