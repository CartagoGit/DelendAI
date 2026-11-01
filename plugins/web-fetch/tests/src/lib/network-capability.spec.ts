import { describe, expect, it } from 'vitest';

import { runWithDryRunScope } from '@delendai/core/public';
import { guardWithAmbientDryRun } from '@delendai/core/lib/capabilities/effect-broker.factory';

import { buildWebToolRegistrations } from '../../../src/lib/tools/tools';

describe('web-fetch network capability (r00034)', () => {
	it('refuses the network effect under the ambient dry-run scope', async () => {
		let handler:
			| ((args: {
					url: string;
					maxBytes?: number;
					timeoutMs?: number;
			  }) => Promise<unknown>)
			| undefined;

		const registrations = buildWebToolRegistrations({
			namespacePrefix: 'delendai',
			allowList: ['example.com'],
			fetchImpl: guardWithAmbientDryRun({
				kind: 'network',
				perform: async (_url: string) =>
					({
						ok: true,
						status: 200,
						headers: { get: () => 'text/plain' },
						text: async () => 'ok',
					}) as unknown as Response,
				describe: (url: string) => url,
			}),
		});

		type RegisterServer = Parameters<
			NonNullable<(typeof registrations)[number]['register']>
		>[0];
		const server = {
			registerTool(
				_name: string,
				_schema: unknown,
				candidate: (...args: unknown[]) => unknown,
			) {
				handler = candidate as typeof handler;
			},
		} as unknown as RegisterServer;

		await registrations[0]?.register(server);

		expect(handler).toBeDefined();
		await runWithDryRunScope(true, async () => {
			await expect(
				handler?.({ url: 'https://example.com/' }),
			).resolves.toEqual(
				expect.objectContaining({
					structuredContent: expect.objectContaining({
						ok: false,
						reason: 'fetch-error',
						detail: expect.stringContaining(
							'DryRunEffectRefusedError: refused network effect',
						),
					}),
				}),
			);
		});
	});
});
