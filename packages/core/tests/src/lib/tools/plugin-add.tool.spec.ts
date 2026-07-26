import { describe, expect, it, vi } from 'vitest';

import type {
	IPluginRegistryEntry,
	IResolvePluginsResult,
} from '@mcp-vertex/core/public';
import { buildPluginAddRegistration } from '@mcp-vertex/core/lib/tools/plugin-add.tool';

type IToolResult = {
	content: Array<{ text: string }>;
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
};

const FIRST_PARTY_ENTRY: IPluginRegistryEntry = {
	id: 'security',
	package: '@mcp-vertex/security',
	summary: 'Security checks.',
	tags: ['security'],
	origin: 'first-party',
};

const COMMUNITY_ENTRY: IPluginRegistryEntry = {
	id: 'community-demo',
	package: '@community/demo',
	summary: 'Community demo plugin.',
	tags: ['community'],
	origin: 'community',
};

const capture = async (
	entries: readonly IPluginRegistryEntry[],
	install = vi.fn(async () => ({ installed: true, note: 'installed' })),
	configure = vi.fn(async () => ({
		configPath: 'mcp-vertex.config.json',
		added: true,
	})),
): Promise<{
	handler: (args: unknown) => Promise<IToolResult>;
	install: typeof install;
	configure: typeof configure;
}> => {
	let handler: ((args: unknown) => Promise<IToolResult>) | undefined;
	const resolve = vi.fn(
		(): IResolvePluginsResult => ({
			entries,
			total: entries.length,
			truncated: false,
		}),
	);
	await buildPluginAddRegistration({
		namespacePrefix: 'mcp-vertex',
		resolve,
		install,
		configure,
	}).register({
		registerTool: (_name: string, _config: unknown, fn: typeof handler) => {
			handler = fn;
		},
	} as never);
	if (handler === undefined) {
		throw new Error('plugin_add handler was not registered');
	}
	return { handler, install, configure };
};

const parse = (result: IToolResult): Record<string, unknown> =>
	(result.structuredContent ??
		(JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>));

describe('plugin_add tool registration (f00141/S2)', () => {
	it('returns not-found and skips install/configure when the id is missing', async () => {
		const { handler, install, configure } = await capture([
			FIRST_PARTY_ENTRY,
		]);
		const result = await handler({ id: 'missing' });
		const payload = parse(result);

		expect(result.isError).toBe(true);
		expect(payload.ok).toBe(false);
		expect(payload.error).toEqual(
			expect.objectContaining({ reason: 'not-found' }),
		);
		expect(install).not.toHaveBeenCalled();
		expect(configure).not.toHaveBeenCalled();
	});

	it('returns a first-party dry-run plan by default without side effects', async () => {
		const { handler, install, configure } = await capture([
			FIRST_PARTY_ENTRY,
		]);
		const payload = parse(await handler({ id: FIRST_PARTY_ENTRY.id }));

		expect(payload).toEqual({
			id: FIRST_PARTY_ENTRY.id,
			package: FIRST_PARTY_ENTRY.package,
			origin: 'first-party',
			dryRun: true,
			installed: false,
			configured: false,
			notes: [],
		});
		expect(install).not.toHaveBeenCalled();
		expect(configure).not.toHaveBeenCalled();
	});

	it('runs install/configure for first-party when dryRun is false', async () => {
		const { handler, install, configure } = await capture([
			FIRST_PARTY_ENTRY,
		]);
		const payload = parse(
			await handler({ id: FIRST_PARTY_ENTRY.id, dryRun: false }),
		);

		expect(payload).toEqual({
			id: FIRST_PARTY_ENTRY.id,
			package: FIRST_PARTY_ENTRY.package,
			origin: 'first-party',
			dryRun: false,
			installed: true,
			configured: true,
			configPath: 'mcp-vertex.config.json',
			notes: ['installed'],
		});
		expect(install).toHaveBeenCalledTimes(1);
		expect(install).toHaveBeenCalledWith(FIRST_PARTY_ENTRY);
		expect(configure).toHaveBeenCalledTimes(1);
		expect(configure).toHaveBeenCalledWith(FIRST_PARTY_ENTRY);
	});

	it('returns consent-required for community entries without consent', async () => {
		const { handler, install, configure } = await capture([
			COMMUNITY_ENTRY,
		]);
		const result = await handler({ id: COMMUNITY_ENTRY.id, dryRun: false });
		const payload = parse(result);

		expect(result.isError).toBe(true);
		expect(payload.ok).toBe(false);
		expect(payload.error).toEqual(
			expect.objectContaining({ reason: 'consent-required' }),
		);
		expect(install).not.toHaveBeenCalled();
		expect(configure).not.toHaveBeenCalled();
	});

	it('runs install/configure for community entries with consent on non-dry runs', async () => {
		const { handler, install, configure } = await capture([
			COMMUNITY_ENTRY,
		]);
		const payload = parse(
			await handler({
				id: COMMUNITY_ENTRY.id,
				consentCommunity: true,
				dryRun: false,
			}),
		);

		expect(payload).toEqual({
			id: COMMUNITY_ENTRY.id,
			package: COMMUNITY_ENTRY.package,
			origin: 'community',
			dryRun: false,
			installed: true,
			configured: true,
			configPath: 'mcp-vertex.config.json',
			notes: ['installed'],
		});
		expect(install).toHaveBeenCalledTimes(1);
		expect(configure).toHaveBeenCalledTimes(1);
	});

	it('keeps community dry-runs side-effect free even when consent is given', async () => {
		const { handler, install, configure } = await capture([
			COMMUNITY_ENTRY,
		]);
		const payload = parse(
			await handler({
				id: COMMUNITY_ENTRY.id,
				consentCommunity: true,
			}),
		);

		expect(payload).toEqual({
			id: COMMUNITY_ENTRY.id,
			package: COMMUNITY_ENTRY.package,
			origin: 'community',
			dryRun: true,
			installed: false,
			configured: false,
			notes: [],
		});
		expect(install).not.toHaveBeenCalled();
		expect(configure).not.toHaveBeenCalled();
	});
});