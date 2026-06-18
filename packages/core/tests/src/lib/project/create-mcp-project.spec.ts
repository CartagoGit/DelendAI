import { describe, expect, it } from 'vitest';

import {
	createMcpProject,
	planRegistrationOrder,
} from '@mcp-vertex/core/lib/project/create-mcp-project';
import { createWorkspacePathProvider } from '@mcp-vertex/core/lib/workspace/create-workspace-path-provider';
import type { IMcpVertexHostConfig } from '@mcp-vertex/core/lib/contracts/interfaces/host-config.interface';
import type { IToolRegistration } from '@mcp-vertex/core/lib/contracts/interfaces/tool-registration.interface';

const registration = (
	id: string,
	registerAfter?: string,
	calls?: string[],
): IToolRegistration => ({
	id,
	registerAfter,
	register: async () => {
		calls?.push(id);
	},
});

const hostConfig = (
	extraTools: readonly IToolRegistration[],
): IMcpVertexHostConfig => ({
	metadata: {
		name: 'spec-server',
		version: '0.0.0',
		description: 'spec host',
	},
	namespacePrefix: 'spec',
	workspace: createWorkspacePathProvider('/tmp/spec-workspace'),
	validationMatrix: { scopes: {} },
	extraTools,
});

describe('planRegistrationOrder', () => {
	it('appends extras without an anchor, preserving declaration order', () => {
		const order = planRegistrationOrder(
			[registration('core-a'), registration('core-b')],
			[registration('x'), registration('y')],
		);
		expect(order.map((entry) => entry.id)).toEqual([
			'core-a',
			'core-b',
			'x',
			'y',
		]);
	});

	it('inserts an anchored extra immediately after its anchor', () => {
		const order = planRegistrationOrder(
			[registration('core-a'), registration('core-b')],
			[registration('x', 'core-a')],
		);
		expect(order.map((entry) => entry.id)).toEqual([
			'core-a',
			'x',
			'core-b',
		]);
	});

	it('keeps declaration order for several extras on the same anchor', () => {
		const order = planRegistrationOrder(
			[registration('core-a'), registration('core-b')],
			[registration('x', 'core-a'), registration('y', 'core-a')],
		);
		expect(order.map((entry) => entry.id)).toEqual([
			'core-a',
			'x',
			'y',
			'core-b',
		]);
	});

	it('throws on duplicate registration ids', () => {
		expect(() =>
			planRegistrationOrder(
				[registration('core-a')],
				[registration('core-a')],
			),
		).toThrow(/duplicate registration id/u);
	});

	it('throws on an unknown registerAfter anchor', () => {
		expect(() =>
			planRegistrationOrder([], [registration('x', 'missing')]),
		).toThrow(/unknown registerAfter anchor/u);
	});

	it('is deterministic: same input yields the same sequence', () => {
		const build = (): readonly string[] =>
			planRegistrationOrder(
				[registration('core-a'), registration('core-b')],
				[
					registration('x', 'core-a'),
					registration('y'),
					registration('z', 'core-b'),
				],
			).map((entry) => entry.id);
		expect(build()).toEqual(build());
	});
});

describe('createMcpProject', () => {
	it('registers extras in planned order and exposes registrationOrder', async () => {
		const calls: string[] = [];
		const assembled = await createMcpProject(
			hostConfig([
				registration('first', undefined, calls),
				registration('second', undefined, calls),
			]),
		);
		expect(calls).toEqual(['first', 'second']);
		expect(assembled.registrationOrder).toEqual(['first', 'second']);
	});

	it('exposes the underlying McpServer instance without connecting', async () => {
		const assembled = await createMcpProject(hostConfig([]));
		expect(assembled.server).toBeDefined();
		expect(assembled.registrationOrder).toEqual([]);
	});
});
