import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import testPolicyPlugin from '../../../../src/index';
import { buildGetPolicyRegistration } from '../../../../src/lib/tools/get-policy.tool';
import { buildSetPolicyRegistration } from '../../../../src/lib/tools/set-policy.tool';

interface ICall {
	name: string;
	def: {
		description?: string;
		inputSchema?: unknown;
		outputSchema?: unknown;
	};
	handler: (args: unknown) => Promise<{
		structuredContent?: Record<string, unknown>;
		content: ReadonlyArray<{ type: string; text: string }>;
	}>;
}

const mkServer = (calls: ICall[]) => ({
	registerTool: (
		name: string,
		def: ICall['def'],
		handler: ICall['handler'],
	) => {
		calls.push({ name, def, handler });
	},
});

const payloadOf = (result: {
	structuredContent?: Record<string, unknown>;
	content: ReadonlyArray<{ type: string; text: string }>;
}): Record<string, unknown> =>
	result.structuredContent ??
	(JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>);

let storeDir: string;

beforeEach(async () => {
	storeDir = await mkdtemp(join(tmpdir(), 'test-policy-tools-'));
});

const capture = async (options?: {
	configMode?: 'tdd' | 'tests-after' | 'free' | 'none';
	extraGuidance?: string;
	allowSetTool?: boolean;
}): Promise<ICall[]> => {
	const calls: ICall[] = [];
	const server = mkServer(calls);
	const shared = {
		namespacePrefix: 'tp',
		storeDir,
		...(options?.configMode !== undefined
			? { configMode: options.configMode }
			: {}),
		...(options?.extraGuidance !== undefined
			? { extraGuidance: options.extraGuidance }
			: {}),
		...(options?.allowSetTool !== undefined
			? { allowSetTool: options.allowSetTool }
			: {}),
	};
	await buildGetPolicyRegistration(shared).register(server as never);
	await buildSetPolicyRegistration(shared).register(server as never);
	return calls;
};

describe('get_test_policy', () => {
	it('registers under the namespace prefix with an outputSchema', async () => {
		const calls = await capture();
		expect(calls[0]?.name).toBe('tp_get_test_policy');
		expect(calls[0]?.def.outputSchema).toBeDefined();
	});

	it('returns the tdd default when nothing is configured', async () => {
		const calls = await capture();
		const payload = payloadOf(await calls[0]!.handler({}));
		expect(payload.mode).toBe('tdd');
		expect(payload.source).toBe('default');
		expect(Array.isArray(payload.guidance)).toBe(true);
	});

	it('reflects the host config mode and extra guidance', async () => {
		const calls = await capture({
			configMode: 'tests-after',
			extraGuidance: 'integration specs are mandatory for tools',
		});
		const payload = payloadOf(await calls[0]!.handler({}));
		expect(payload.mode).toBe('tests-after');
		expect(payload.source).toBe('config');
		expect(payload.extraGuidance).toBe(
			'integration specs are mandatory for tools',
		);
	});
});

describe('set_test_policy', () => {
	it('persists an override that get then reports with source override', async () => {
		const calls = await capture({ configMode: 'tests-after' });
		const set = payloadOf(
			await calls[1]!.handler({
				mode: 'none',
				reason: 'prototype spike',
			}),
		);
		expect(set.ok).toBe(true);
		expect(set.mode).toBe('none');
		const get = payloadOf(await calls[0]!.handler({}));
		expect(get.mode).toBe('none');
		expect(get.source).toBe('override');
	});

	it('clears the override when mode is "config" sentinel absent — reset via clear flag', async () => {
		const calls = await capture({ configMode: 'free' });
		await calls[1]!.handler({ mode: 'none' });
		const cleared = payloadOf(await calls[1]!.handler({ clear: true }));
		expect(cleared.ok).toBe(true);
		const get = payloadOf(await calls[0]!.handler({}));
		expect(get.mode).toBe('free');
		expect(get.source).toBe('config');
	});

	it('rejects an unknown mode with a structured error', async () => {
		const calls = await capture();
		const payload = payloadOf(await calls[1]!.handler({ mode: 'yolo' }));
		expect(payload.ok).toBe(false);
	});

	it('refuses to write when the host disabled runtime overrides', async () => {
		const calls = await capture({ allowSetTool: false });
		const payload = payloadOf(await calls[1]!.handler({ mode: 'free' }));
		expect(payload.ok).toBe(false);
		const get = payloadOf(await calls[0]!.handler({}));
		expect(get.mode).toBe('tdd');
	});
});

describe('plugin entry', () => {
	const mkCtx = (options: Record<string, unknown>) => ({
		workspace: {
			root: storeDir,
			resolve: (rel: string) => join(storeDir, rel),
		},
		corePaths: { cacheDir: '.cache', docsDir: 'docs' },
		cacheDir: '.cache',
		docsDir: 'docs',
		keepLegacy: false,
		pluginCacheDir: '.cache/test-policy',
		pluginDocsDir: 'docs/test-policy',
		namespacePrefix: 'tp',
		options,
		args: {},
	});

	it('registers two tools and a knowledge entry naming the active mode', async () => {
		const result = await testPolicyPlugin.register(mkCtx({}) as never);
		expect(result.tools).toHaveLength(2);
		expect(result.knowledge?.length).toBeGreaterThanOrEqual(1);
		const body = result.knowledge?.[0]?.body ?? '';
		expect(body.toLowerCase()).toContain('tdd');
	});

	it('rejects a misconfigured options block with a hard boot error', async () => {
		await expect(
			testPolicyPlugin.register(mkCtx({ mode: 'yolo' }) as never),
		).rejects.toThrow(/test-policy/);
	});
});
