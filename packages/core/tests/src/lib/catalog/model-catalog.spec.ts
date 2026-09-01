import { describe, expect, it } from 'vitest';

import {
	InMemoryModelCatalog,
	ModelCatalogError,
} from '@mcp-vertex/core/lib/catalog';
import type { IModelCatalogEntry } from '@mcp-vertex/core/lib/contracts/interfaces/model-catalog.interface';

const model = (
	overrides: Partial<IModelCatalogEntry> = {},
): IModelCatalogEntry => ({
	key: 'sonnet',
	aliases: ['claude', 'sonnet-4'],
	provider: 'anthropic',
	source: 'built-in',
	lifecycle: 'active',
	id: 'anthropic-sonnet',
	kind: 'api',
	invoke: {
		kind: 'api',
		url: 'https://example.test',
		envVar: 'ANTHROPIC_API_KEY',
	},
	modelId: 'claude-sonnet-4',
	contextWindow: 200_000,
	costTier: 3,
	strengths: ['reasoning', 'long-context'],
	weaknesses: [],
	...overrides,
});

describe('InMemoryModelCatalog', () => {
	it('supports lifecycle and immutable snapshots', () => {
		const catalog = new InMemoryModelCatalog();
		const entry = catalog.register(model());
		expect(catalog.get('SONNET')).toBe(entry);
		expect(Object.isFrozen(entry)).toBe(true);
		expect(Object.isFrozen(entry.aliases)).toBe(true);
		expect(() => (entry.aliases as string[]).push('x')).toThrow();
		expect(catalog.unregister('sonnet')).toBe(true);
		expect(catalog.get('sonnet')).toBeUndefined();
	});

	it('deeply clones nested MCP invocation arguments', () => {
		const args: Record<string, unknown> & {
			options: { effort: string; tags: string[] };
		} = { options: { effort: 'high', tags: ['coding'] } };
		const entry = model({
			key: 'mcp-model',
			aliases: [],
			invoke: {
				kind: 'mcp-server',
				server: 'provider',
				tool: 'invoke',
				args,
			},
		});
		const catalog = new InMemoryModelCatalog();
		const snapshot = catalog.register(entry);

		expect(snapshot.invoke.kind).toBe('mcp-server');
		if (snapshot.invoke.kind !== 'mcp-server') return;
		const snapshotArgs = snapshot.invoke.args as typeof args;
		expect(snapshotArgs).not.toBe(args);
		expect(snapshotArgs.options).not.toBe(args.options);
		expect(Object.isFrozen(snapshotArgs.options)).toBe(true);
		expect(Object.isFrozen(snapshotArgs.options.tags)).toBe(true);
		args.options.effort = 'low';
		args.options.tags.push('review');
		expect(snapshotArgs.options.effort).toBe('high');
		expect(snapshotArgs.options.tags).toEqual(['coding']);
	});

	it('rejects duplicate keys and aliases atomically', () => {
		const catalog = new InMemoryModelCatalog();
		catalog.register(model());
		expect(() => catalog.register(model())).toThrowError(ModelCatalogError);
		expect(() =>
			catalog.register(model({ key: 'other', aliases: ['claude'] })),
		).toThrowError(ModelCatalogError);
		expect(() =>
			catalog.register(model({ key: 'third', aliases: ['sonnet'] })),
		).toThrowError(ModelCatalogError);
		expect(catalog.list()).toHaveLength(1);
	});

	it('filters and searches by provider, capabilities and context', () => {
		const catalog = new InMemoryModelCatalog();
		catalog.register(model());
		catalog.register(
			model({
				key: 'haiku',
				aliases: ['quick'],
				id: 'anthropic-haiku',
				modelId: 'claude-haiku-3',
				contextWindow: 64_000,
				strengths: ['fast-iteration'],
				lifecycle: 'deprecated',
			}),
		);
		catalog.register(
			model({
				key: 'gpt',
				aliases: ['openai'],
				id: 'openai-gpt',
				modelId: 'gpt-5',
				provider: 'openai',
				strengths: ['reasoning'],
			}),
		);
		expect(
			catalog.list({
				provider: 'ANTHROPIC',
				capabilities: ['long-context'],
				minContextWindow: 100_000,
			}),
		).toHaveLength(1);
		expect(
			catalog.list({ lifecycle: 'deprecated' }).map((entry) => entry.key),
		).toEqual(['haiku']);
		expect(catalog.search('SONNET')).toHaveLength(1);
		expect(catalog.resolveAlias('CLAUDE')?.key).toBe('sonnet');
		expect(catalog.resolveAlias('missing')).toBeUndefined();
	});

	it('enforces limits and clear', () => {
		const catalog = new InMemoryModelCatalog();
		catalog.register(model({ aliases: [] }));
		catalog.register(
			model({ key: 'other', aliases: [], provider: 'openai' }),
		);
		expect(catalog.list({ limit: 1 })).toHaveLength(1);
		expect(catalog.list({ limit: 999 })).toHaveLength(2);
		expect(() => catalog.list({ limit: 0 })).toThrowError(
			ModelCatalogError,
		);
		catalog.clear();
		expect(catalog.list()).toEqual([]);
	});
});
