/**
 * plugin-availability.service.spec.ts — every plugin answers whether it
 * can work here, whether or not it says anything about itself.
 */
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import { PLUGIN_AVAILABILITY_STATES } from '@delendai/core/lib/contracts/constants/plugin-availability.constant';
import {
	availabilityOf,
	provenAvailabilityOf,
} from '@delendai/core/lib/plugins/plugin-availability.service';
import type { IMcpPluginContext } from '@delendai/core/lib/plugins/plugin-contract';

const ctx = fakePartial<IMcpPluginContext>({ options: { file: '' } });

describe('availabilityOf', () => {
	it('takes a plugin that says nothing to be registered, not proved', async () => {
		expect(await availabilityOf({}, ctx)).toEqual({ state: 'registered' });
	});

	it('passes on what a plugin says, read from its own context', async () => {
		const answer = await availabilityOf(
			{
				availability: (context) =>
					context.options.file === ''
						? {
								state: 'needs-configuration',
								missing: 'no roadmap file',
								fix: 'set plugins.roadmap.options.file',
							}
						: { state: 'registered' },
			},
			ctx,
		);
		expect(answer).toEqual({
			state: 'needs-configuration',
			missing: 'no roadmap file',
			fix: 'set plugins.roadmap.options.file',
		});
	});

	it('reports a plugin whose answer fails as degraded, with the reason', async () => {
		const answer = await availabilityOf(
			{
				availability: async () => {
					throw new Error('probe could not read the driver');
				},
			},
			ctx,
		);
		expect(answer).toEqual({
			state: 'degraded',
			missing: 'probe could not read the driver',
		});
		expect(
			await availabilityOf(
				{
					availability: () => {
						throw 'bare';
					},
				},
				ctx,
			),
		).toEqual({ state: 'degraded', missing: 'bare' });
	});

	it('has one fixed set of states', () => {
		expect(PLUGIN_AVAILABILITY_STATES).toEqual([
			'library',
			'needs-configuration',
			'needs-installation',
			'needs-host-adapter',
			'registered',
			'verified',
			'degraded',
		]);
	});
});

describe('provenAvailabilityOf', () => {
	const at = () => new Date('2026-10-14T08:00:00.000Z');

	it('takes a plugin whose probe passes to be verified, with the time', async () => {
		expect(
			await provenAvailabilityOf({ probe: () => undefined }, ctx, at),
		).toEqual({
			state: 'verified',
			verifiedAt: '2026-10-14T08:00:00.000Z',
		});
	});

	it('takes a plugin whose probe throws, or takes too long, to be degraded', async () => {
		expect(
			await provenAvailabilityOf(
				{
					probe: async () => {
						throw new Error('no driver answered');
					},
				},
				ctx,
				at,
			),
		).toEqual({
			state: 'degraded',
			missing: 'its probe failed: no driver answered',
		});
		const slow = await provenAvailabilityOf(
			{ probe: () => new Promise<void>(() => undefined) },
			ctx,
			at,
			10,
		);
		expect(slow).toEqual({
			state: 'degraded',
			missing: 'its probe failed: its probe took over 10 ms',
		});
		expect(
			await provenAvailabilityOf(
				{
					probe: () => {
						throw 'bare';
					},
				},
				ctx,
				at,
			),
		).toEqual({ state: 'degraded', missing: 'its probe failed: bare' });
	});

	it('runs no probe for a plugin that already says what it is missing, or has none', async () => {
		let probed = false;
		const answer = await provenAvailabilityOf(
			{
				availability: () => ({
					state: 'needs-configuration',
					missing: 'no file',
				}),
				probe: () => {
					probed = true;
				},
			},
			ctx,
		);
		expect(answer.state).toBe('needs-configuration');
		expect(probed).toBe(false);
		expect(await provenAvailabilityOf({}, ctx)).toEqual({
			state: 'registered',
		});
	});
});
