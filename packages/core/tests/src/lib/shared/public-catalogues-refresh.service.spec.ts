/**
 * public-catalogues-refresh.service.spec.ts — the refresh at each MCP
 * start reads the project's sources before the defaults, and stays off
 * the network offline and under test.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { refreshPublicCatalogues } from '../../../../src/lib/shared/public-catalogues-refresh.service';

describe('refreshPublicCatalogues', () => {
	it('asks both catalogues, the project sources first', async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'refresh-'));
		writeFileSync(
			join(workspace, 'delendai.config.json'),
			JSON.stringify({
				catalogues: { agents: ['https://team.test/agents.json'] },
			}),
		);
		const asked: Record<string, readonly string[]> = {};
		const done = await refreshPublicCatalogues({
			workspace,
			env: {},
			read: {
				models: async (sources) => {
					asked.models = sources;
				},
				agents: async (sources) => {
					asked.agents = sources;
					throw new Error(
						'a failing source never rejects the refresh',
					);
				},
			},
		});
		expect(done).toBe(true);
		expect(asked.agents?.[0]).toBe('https://team.test/agents.json');
		expect(asked.models).toEqual(['https://models.dev/api.json']);
	});

	it('does nothing offline or under test', async () => {
		const never = {
			models: async () => {
				throw new Error('asked');
			},
			agents: async () => {
				throw new Error('asked');
			},
		};
		const workspace = tmpdir();
		expect(
			await refreshPublicCatalogues({
				workspace,
				env: { DELENDAI_OFFLINE: '1' },
				read: never,
			}),
		).toBe(false);
		expect(
			await refreshPublicCatalogues({
				workspace,
				env: { VITEST: 'true' },
				read: never,
			}),
		).toBe(false);
	});
});
