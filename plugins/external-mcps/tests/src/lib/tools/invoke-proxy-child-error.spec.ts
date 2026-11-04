/**
 * invoke-proxy-child-error.spec.ts — a tool execution error the child
 * reports in-band (`result.isError`) stays an error through the proxy,
 * in bare mode and in capability mode.
 */
import { describe, expect, it } from 'vitest';

import { createFakeToolServer, fakePartial } from '@delendai/test-kit';

import type { IToolTextResult } from '@delendai/core/public';

import type {
	ICapabilityGateway,
	IProjectContract,
} from '../../../../src/lib/contracts/interfaces/project-contract.interface';
import type { ExternalServerRegistry } from '../../../../src/lib/subprocess/server-registry';
import { buildCallToolRegistration } from '../../../../src/lib/tools/invoke-proxy';

type Handler = (args: unknown) => Promise<IToolTextResult>;

const failure = {
	isError: true,
	content: [{ type: 'text', text: 'node 9:9 not found' }],
};
const success = { content: [{ type: 'text', text: 'fine' }] };

const registryReturning = (result: unknown): ExternalServerRegistry =>
	fakePartial<
		ExternalServerRegistry,
		'has' | 'status' | 'declaredIds' | 'call'
	>({
		has: () => true,
		declaredIds: () => ['figma'],
		status: () => [],
		call: async () => ({ ok: true, result }),
	});

const gateway: ICapabilityGateway = fakePartial<
	ICapabilityGateway,
	'contract' | 'keep' | 'components'
>({
	contract: async () => fakePartial<IProjectContract>({}),
	keep: async () => undefined,
	components: async () => [],
});

const invoke = async (
	result: unknown,
	args: Record<string, unknown>,
	withGateway: boolean,
): Promise<Record<string, unknown>> => {
	const registration = buildCallToolRegistration({
		namespacePrefix: 'ext',
		registry: registryReturning(result),
		llmDecidesActivation: true,
		requireHumanAckWhenLlmDecides: false,
		...(withGateway ? { gateway } : {}),
	});
	let handler: Handler | undefined;
	await registration.register(
		createFakeToolServer({
			onRegisterTool: (tool) => {
				handler = tool.handler as Handler;
			},
		}),
	);
	const out = await handler!({ server: 'figma', tool: 'get', ...args });
	return JSON.parse((out.content[0] as { text: string }).text) as Record<
		string,
		unknown
	>;
};

describe('invoke proxy and a child tool error', () => {
	it('bare mode reports ok:false with the child text and keeps the result', async () => {
		const body = await invoke(failure, {}, false);
		expect(body).toMatchObject({
			ok: false,
			code: 'call-failed',
			hint: 'node 9:9 not found',
			result: failure,
		});
	});

	it('capability mode reports ok:false and marks the normalized answer', async () => {
		const body = await invoke(
			failure,
			{ capability: 'browser.screenshot' },
			true,
		);
		expect(body).toMatchObject({
			ok: false,
			code: 'call-failed',
			hint: 'node 9:9 not found',
			normalized: { isError: true },
		});
	});

	it('a successful child answer is still ok:true', async () => {
		expect(await invoke(success, {}, false)).toMatchObject({
			ok: true,
			result: success,
		});
		const normalized = await invoke(
			success,
			{ capability: 'browser.screenshot' },
			true,
		);
		expect(normalized.ok).toBe(true);
	});
});
