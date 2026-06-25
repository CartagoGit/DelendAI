import { describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';
import type { IToolRegistration } from '@mcp-vertex/core/lib/contracts/interfaces/tool-registration.interface';

const fakePlugin = {
	name: 'demo',
	version: '9.9.9',
	describe: 'demo plugin',
	register: () => ({
		tools: [
			{
				id: 'do',
				summary: 'does the thing',
				register: async () => {},
			},
			{
				id: 'long',
				summary:
					'This summary is intentionally long enough to prove the overview keeps full payloads bounded while still surfacing a useful one-line description.',
				register: async () => {},
			},
		],
		knowledge: [{ id: 'demo-guide', title: 'Demo guide', body: 'BODY' }],
	}),
};

const callTool = async (
	tool: IToolRegistration,
	args: unknown = {},
): Promise<any> => {
	let handler: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await tool.register({
		registerTool: (_n: string, _d: unknown, h: typeof handler) => {
			handler = h;
		},
	} as never);
	const result = await handler!(args);
	return JSON.parse(result.content[0]?.text ?? '{}');
};

const assemble = async () => {
	const args = parseCliArgs(['--plugins=demo', '--workspace=/ws'], '/cwd');
	const { config } = await assembleCliConfig(args, {
		import: async () => ({ default: fakePlugin }),
		readFile: async () =>
			JSON.stringify({
				validationMatrix: {
					scopes: {
						full: [{ command: 'bun test', expect: 'exit0' }],
					},
				},
			}),
	});
	const byId = (id: string): IToolRegistration =>
		config.extraTools!.find((tool) => tool.id === id)!;
	return { config, byId };
};

describe('core meta-tools', async () => {
	it('overview maps the server, plugins, tools (with summaries) and knowledge', async () => {
		const { byId } = await assemble();
		const snap = await callTool(byId('overview'));
		expect(snap.plugins.map((p: { name: string }) => p.name)).toContain(
			'demo',
		);
		expect(
			snap.tools.find(
				(t: { name: string }) => t.name === 'mcp-vertex_demo_do',
			)?.summary,
		).toBe('does the thing');
		expect(snap.knowledge.map((k: { id: string }) => k.id)).toContain(
			'demo-guide',
		);
		expect(typeof snap.recommendedNextAction).toBe('string');
	});

	it('knowledge lists ids and fetches a body by id', async () => {
		const { byId } = await assemble();
		const list = await callTool(byId('knowledge'));
		expect(list.entries.map((e: { id: string }) => e.id)).toContain(
			'demo-guide',
		);
		const got = await callTool(byId('knowledge'), { id: 'demo-guide' });
		expect(got.body).toBe('BODY');
		const missing = await callTool(byId('knowledge'), { id: 'nope' });
		expect(missing.ok).toBe(false);
	});

	it('get_validation_matrix returns the configured commands', async () => {
		const { byId } = await assemble();
		const matrix = await callTool(byId('get_validation_matrix'));
		expect(matrix.scopes.full[0].command).toBe('bun test');
	});

	it('overview compact:true returns only names (low-token)', async () => {
		const { byId } = await assemble();
		const compact = await callTool(byId('overview'), { compact: true });
		expect(Array.isArray(compact.tools)).toBe(true);
		expect(typeof compact.tools[0]).toBe('string'); // names, not objects
		expect(compact.plugins).toContain('demo');
	});

	it('overview full bounds long tool summaries', async () => {
		const { byId } = await assemble();
		const snap = await callTool(byId('overview'));
		const summary = snap.tools.find(
			(t: { name: string }) => t.name === 'mcp-vertex_demo_long',
		)?.summary;
		expect(summary).toHaveLength(96);
		expect(summary.endsWith('...')).toBe(true);
	});
});
