import { describe, expect, it } from 'vitest';

import { buildSkillResolver } from '@mcp-vertex/core/lib/skills/sources/resolver';
import type {
	ILoadedSkill,
	ISkillDescriptor,
	ISkillSource,
} from '@mcp-vertex/core/lib/skills/sources/types';

const FIXED_NOW = (): Date => new Date('2026-08-26T00:00:00.000Z');

const makeDescriptor = (
	overrides: Partial<ISkillDescriptor>,
): ISkillDescriptor => ({
	id: 'unknown',
	version: '0.0.0',
	description: '',
	tags: [],
	appliesTo: ['@mcp-vertex/*'],
	source: 'package',
	owner: 'unknown',
	hash: 'h:0',
	estimatedBodyTokens: 0,
	...overrides,
});

const makeLoadedSkill = (overrides: Partial<ILoadedSkill>): ILoadedSkill => ({
	...makeDescriptor({}),
	body: '',
	loadedAtIso: FIXED_NOW().toISOString(),
	...overrides,
});

const fakeSource = (
	id: string,
	source: ISkillSource['source'],
	descriptors: readonly ISkillDescriptor[],
	bodies: Readonly<Record<string, string>> = {},
): ISkillSource => ({
	id,
	source,
	async list() {
		return descriptors;
	},
	async load(skillId: string) {
		if (!(skillId in bodies)) return null;
		const desc =
			descriptors.find((d) => d.id === skillId) ??
			makeDescriptor({ id: skillId, source });
		return makeLoadedSkill({
			...desc,
			body: bodies[skillId] ?? '',
		});
	},
});

describe('skills/sources/resolver (q00009 / f00262)', () => {
	it('returns descriptors in source declaration order, deduped by id', async () => {
		const ws = fakeSource('ws', 'workspace', [
			makeDescriptor({ id: 'shared', source: 'workspace' }),
		]);
		const core = fakeSource('core', 'package', [
			makeDescriptor({ id: 'shared', source: 'package' }),
			makeDescriptor({ id: 'unique-core', source: 'package' }),
		]);
		const plugin = fakeSource('plugin', 'plugin', [
			makeDescriptor({ id: 'shared', source: 'plugin' }),
			makeDescriptor({ id: 'unique-plugin', source: 'plugin' }),
		]);

		const resolver = buildSkillResolver({
			sources: [ws, core, plugin],
			now: FIXED_NOW,
		});
		const result = await resolver.list();
		const ids = result.descriptors.map((d) => d.id).sort();
		expect(ids).toEqual(['shared', 'unique-core', 'unique-plugin']);
		// Workspace wins for the shared id.
		const shared = result.descriptors.find((d) => d.id === 'shared');
		expect(shared?.source).toBe('workspace');
		expect(result.winningSources.shared).toBe('ws');
	});

	it('plugin skills win over package skills for the same id', async () => {
		const core = fakeSource('core', 'package', [
			makeDescriptor({ id: 'shared', source: 'package' }),
		]);
		const plugin = fakeSource('plugin', 'plugin', [
			makeDescriptor({ id: 'shared', source: 'plugin' }),
		]);

		const resolver = buildSkillResolver({
			sources: [core, plugin],
			now: FIXED_NOW,
		});
		const list = await resolver.list();
		const shared = list.descriptors.find((d) => d.id === 'shared');
		expect(shared?.source).toBe('plugin');
	});

	it('load() walks sources in precedence order until one resolves', async () => {
		const core = fakeSource('core', 'package', [], {
			coreSkill: 'core body',
		});
		const plugin = fakeSource('plugin', 'plugin', [], {
			pluginSkill: 'plugin body',
		});

		const resolver = buildSkillResolver({
			sources: [core, plugin],
			now: FIXED_NOW,
		});

		const coreLoaded = await resolver.load('coreSkill');
		expect(coreLoaded.skill?.body).toBe('core body');
		expect(coreLoaded.sourceId).toBe('core');

		const pluginLoaded = await resolver.load('pluginSkill');
		expect(pluginLoaded.skill?.body).toBe('plugin body');
		expect(pluginLoaded.sourceId).toBe('plugin');

		const missing = await resolver.load('does-not-exist');
		expect(missing.skill).toBeNull();
		expect(missing.sourceId).toBeNull();
	});

	it('stamps loadedAtIso from the injected clock', async () => {
		const source = fakeSource(
			's',
			'package',
			[makeDescriptor({ id: 'foo', source: 'package' })],
			{ foo: 'body' },
		);
		const resolver = buildSkillResolver({
			sources: [source],
			now: FIXED_NOW,
		});
		const result = await resolver.load('foo');
		expect(result.skill?.loadedAtIso).toBe('2026-08-26T00:00:00.000Z');
	});

	it('workspace > plugin > package > core precedence is enforced', async () => {
		const core = fakeSource('core', 'package', [
			makeDescriptor({ id: 'a', source: 'package' }),
		]);
		const plugin = fakeSource('plugin', 'plugin', [
			makeDescriptor({ id: 'a', source: 'plugin' }),
		]);
		const ws = fakeSource('ws', 'workspace', [
			makeDescriptor({ id: 'a', source: 'workspace' }),
		]);
		// Declaration order is irrelevant; precedence is by source kind.
		const resolver = buildSkillResolver({
			sources: [core, plugin, ws],
			now: FIXED_NOW,
		});
		const result = await resolver.list();
		const a = result.descriptors.find((d) => d.id === 'a');
		expect(a?.source).toBe('workspace');
	});
});
