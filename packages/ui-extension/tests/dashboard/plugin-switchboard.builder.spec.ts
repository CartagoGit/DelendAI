import { describe, expect, it } from 'vitest';

import { buildPluginSwitchboardModel } from '../../src/dashboard/builders/plugin-switchboard.builder';

describe('buildPluginSwitchboardModel', () => {
	it('degrades to an actionable hint when activation introspection is absent', () => {
		expect(buildPluginSwitchboardModel({}).kind).toBe('unavailable');
	});

	it('groups in ours/yours/external order with stable ids and toggle state', () => {
		const model = buildPluginSwitchboardModel({
			activationReport: {
				entries: [
					{
						id: 'ext.fs',
						origin: 'external',
						active: false,
						source: 'config',
						toolCount: 0,
					},
					{
						id: 'local',
						origin: 'user-local',
						active: true,
						source: 'config',
						toolCount: 2,
					},
					{
						id: 'git',
						origin: 'bundled',
						active: true,
						source: 'preset',
						toolCount: 3,
					},
				],
			},
		});
		if (model.kind !== 'ready') throw new Error('expected ready');
		expect(model.groups.map((group) => group.badge)).toEqual([
			'ours',
			'yours',
			'external',
		]);
		expect(model.groups.flatMap((group) => group.rows)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'git', nextActive: false }),
				expect.objectContaining({ id: 'ext.fs', nextActive: true }),
			]),
		);
		expect(model).toMatchObject({ total: 3, active: 2 });
	});

	it('returns a ready empty model for an available empty report', () => {
		expect(
			buildPluginSwitchboardModel({ activationReport: { entries: [] } }),
		).toEqual({ kind: 'ready', groups: [], total: 0, active: 0 });
	});
});
