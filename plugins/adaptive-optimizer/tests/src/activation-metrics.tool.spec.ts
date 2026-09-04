import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildAdaptiveOptimizerToolRegistrations } from '../../src/public/index';

class FakeServer {
	tools: Record<string, { handler: (args: unknown) => Promise<unknown> }> =
		{};

	registerTool(
		name: string,
		_meta: unknown,
		handler: (args: unknown) => Promise<unknown>,
	) {
		this.tools[name] = { handler };
	}
}

const parseStructured = (value: unknown): Record<string, unknown> =>
	(value as { structuredContent: Record<string, unknown> }).structuredContent;

const createdRoots: string[] = [];

const makeWorkspace = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'adaptive-optimizer-'));
	createdRoots.push(root);
	await mkdir(join(root, 'docs'), { recursive: true });
	await mkdir(join(root, 'packages/cli'), { recursive: true });
	await writeFile(
		join(root, 'delendai.config.json'),
		'{"plugins":{}}\n',
		'utf8',
	);
	await writeFile(join(root, 'package.json'), '{"name":"demo"}\n', 'utf8');
	return root;
};

afterEach(async () => {
	for (const root of createdRoots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

describe('activation_metrics', () => {
	it('registers alongside optimize_run', async () => {
		const root = await makeWorkspace();
		const registrations = buildAdaptiveOptimizerToolRegistrations({
			namespacePrefix: 'delendai',
			workspaceRootAbs: root,
			maxBytes: 2000,
			discoverRosterFn: async () => ({ available: [], missing: [] }),
		});
		expect(registrations.map((r) => r.id).sort()).toEqual([
			'activation_metrics',
			'adaptive_facade',
			'optimize_run',
		]);
	});

	it('starts in the discriminated no-samples state', async () => {
		const root = await makeWorkspace();
		const registrations = buildAdaptiveOptimizerToolRegistrations({
			namespacePrefix: 'delendai',
			workspaceRootAbs: root,
			maxBytes: 2000,
			discoverRosterFn: async () => ({ available: [], missing: [] }),
		});
		const server = new FakeServer();
		for (const registration of registrations) {
			await registration.register(server as never);
		}
		const out = parseStructured(
			await server.tools['delendai_activation_metrics']!.handler({}),
		);
		expect(out).toEqual({
			activations: 0,
			responses: { hasSamples: false },
		});
	});

	it('records one activation per successful optimize_run call', async () => {
		const root = await makeWorkspace();
		const registrations = buildAdaptiveOptimizerToolRegistrations({
			namespacePrefix: 'delendai',
			workspaceRootAbs: root,
			maxBytes: 2000,
			discoverRosterFn: async () => ({ available: [], missing: [] }),
		});
		const server = new FakeServer();
		for (const registration of registrations) {
			await registration.register(server as never);
		}
		await server.tools['delendai_optimize_run']!.handler({
			candidates: [{ id: 'candidate-a' }],
			budget: 10,
			consent: true,
		});
		const out = parseStructured(
			await server.tools['delendai_activation_metrics']!.handler({}),
		);
		expect(out.activations).toBe(1);
		expect((out.responses as { hasSamples: boolean }).hasSamples).toBe(
			true,
		);
	});

	it('does not record an activation when optimize_run rejects (no consent)', async () => {
		const root = await makeWorkspace();
		const registrations = buildAdaptiveOptimizerToolRegistrations({
			namespacePrefix: 'delendai',
			workspaceRootAbs: root,
			maxBytes: 2000,
			discoverRosterFn: async () => ({ available: [], missing: [] }),
		});
		const server = new FakeServer();
		for (const registration of registrations) {
			await registration.register(server as never);
		}
		await server.tools['delendai_optimize_run']!.handler({
			candidates: [{ id: 'candidate-a' }],
			budget: 10,
			consent: false,
		});
		const out = parseStructured(
			await server.tools['delendai_activation_metrics']!.handler({}),
		);
		expect(out).toEqual({
			activations: 0,
			responses: { hasSamples: false },
		});
	});
});
