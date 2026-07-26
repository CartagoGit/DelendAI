import { describe, expect, it } from 'vitest';

import {
	buildContainerInspectToolRegistrations,
	type IContainerInspectToolOptions,
} from './container-inspect.tool';

type ToolBody = {
	content: Array<{ text: string }>;
};

const capture = async (options: IContainerInspectToolOptions) => {
	const registrations = buildContainerInspectToolRegistrations(options);
	const registration = registrations[0];
	if (registration === undefined) {
		throw new Error('missing container_inspect registration');
	}
	let name = '';
	let meta: Record<string, unknown> | undefined;
	let handler: ((args: unknown) => Promise<unknown>) | undefined;
	await registration.register({
		registerTool: (
			toolName: string,
			toolMeta: Record<string, unknown>,
			fn: (args: unknown) => Promise<unknown>,
		) => {
			name = toolName;
			meta = toolMeta;
			handler = fn;
			return { dispose: () => undefined } as never;
		},
	} as never);
	if (handler === undefined || meta === undefined) {
		throw new Error('tool handler was not registered');
	}
	return { registration, name, meta, handler };
};

const call = async (
	handler: (args: unknown) => Promise<unknown>,
	args: unknown,
): Promise<Record<string, unknown>> => {
	const result = (await handler(args)) as ToolBody;
	return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
};

describe('container_inspect tool', () => {
	it('registers the expected tool shape', async () => {
		const { registration, name, meta } = await capture({
			namespacePrefix: 'container',
			deps: {
				probeBinary: async () => ({ present: true }),
				exec: async () => ({ stdout: '', stderr: '' }),
			},
		});

		expect(registration.id).toBe('container_inspect');
		expect(name).toBe('container_container_inspect');
		expect(meta.description).toMatch(/Read-only container inspection/);
		expect(meta.inputSchema).toBeDefined();
		expect(meta.outputSchema).toBeDefined();
	});

	it('returns a success envelope on the happy path', async () => {
		const { handler } = await capture({
			namespacePrefix: 'container',
			deps: {
				probeBinary: async () => ({ present: true }),
				exec: async () => ({
					stdout:
						'{"ID":"sha256:1","Repository":"nginx","Tag":"latest","Size":"187MB","CreatedAt":"2026-07-26T12:00:00Z"}',
					stderr: '',
				}),
			},
		});

		await expect(
			call(handler, { kind: 'docker-images' }),
		).resolves.toEqual({
			ok: true,
			kind: 'docker-images',
			items: [
				{
					id: 'sha256:1',
					repository: 'nginx',
					tag: 'latest',
					size: '187MB',
					createdAt: '2026-07-26T12:00:00.000Z',
				},
			],
		});
	});

	it('returns skipped with a hint when the requested CLI is missing', async () => {
		const { handler } = await capture({
			namespacePrefix: 'container',
			deps: {
				probeBinary: async () => ({
					present: false,
					hint: 'install kubectl',
				}),
				exec: async () => ({ stdout: '', stderr: '' }),
			},
		});

		await expect(
			call(handler, { kind: 'k8s-get', namespace: 'apps' }),
		).resolves.toEqual({
			ok: 'skipped',
			hint: 'install kubectl',
		});
	});
});
