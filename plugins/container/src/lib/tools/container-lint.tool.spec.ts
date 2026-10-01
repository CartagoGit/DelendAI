import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import {
	buildContainerLintToolRegistrations,
	buildContainerLogsToolRegistrations,
	type IContainerLintToolOptions,
	type IContainerLogsToolOptions,
} from './container-lint.tool';

type ToolBody = {
	content: Array<{ text: string }>;
};

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => rm(dir, { force: true, recursive: true })),
	);
});

const capture = async (
	registrationBuilder:
		| ReturnType<typeof buildContainerLogsToolRegistrations>
		| ReturnType<typeof buildContainerLintToolRegistrations>,
	toolName: string,
) => {
	const registration = registrationBuilder.find(
		(entry) => entry.id === toolName,
	);
	if (registration === undefined) {
		throw new Error(`missing ${toolName} registration`);
	}
	let name = '';
	let meta: Record<string, unknown> | undefined;
	let handler: ((args: unknown) => Promise<unknown>) | undefined;
	await registration.register({
		registerTool: (
			registeredName: string,
			registeredMeta: Record<string, unknown>,
			fn: (args: unknown) => Promise<unknown>,
		) => {
			name = registeredName;
			meta = registeredMeta;
			handler = fn;
			return { dispose: () => undefined } as never;
		},
	} as never);
	if (meta === undefined || handler === undefined) {
		throw new Error(`tool ${toolName} was not registered`);
	}
	return { name, meta, handler };
};

const call = async (
	handler: (args: unknown) => Promise<unknown>,
	args: unknown,
): Promise<Record<string, unknown>> => {
	const result = (await handler(args)) as ToolBody;
	return JSON.parse(result.content[0]?.text ?? '{}') as Record<
		string,
		unknown
	>;
};

describe('container logs and lint tools', () => {
	it('registers the expected logs tool shape and returns parsed lines', async () => {
		const { name, meta, handler } = await capture(
			buildContainerLogsToolRegistrations({
				namespacePrefix: 'container',
				deps: {
					probeBinary: async () => ({ present: true }),
					exec: async () => ({
						stdout: '2026-07-26T12:00:00Z ready',
						stderr: '',
					}),
				},
			} satisfies IContainerLogsToolOptions),
			'container_logs',
		);

		expect(name).toBe('container_container_logs');
		expect(meta.outputSchema).toBeDefined();
		await expect(call(handler, { container: 'api' })).resolves.toEqual({
			ok: true,
			container: 'api',
			lines: [
				{
					timestamp: '2026-07-26T12:00:00.000Z',
					stream: 'stdout',
					message: 'ready',
				},
			],
		});
	});

	it('returns skipped from container_logs when docker is missing', async () => {
		const { handler } = await capture(
			buildContainerLogsToolRegistrations({
				namespacePrefix: 'container',
				deps: {
					probeBinary: async () => ({
						present: false,
						hint: 'install docker',
					}),
					exec: async () => ({ stdout: '', stderr: '' }),
				},
			}),
			'container_logs',
		);

		await expect(call(handler, { container: 'api' })).resolves.toEqual({
			ok: 'skipped',
			hint: 'install docker',
		});
	});

	it('lints a Dockerfile from disk and defaults to the workspace Dockerfile', async () => {
		const workspace = await mkdtemp(join(tmpdir(), 'container-plugin-'));
		tempDirs.push(workspace);
		await writeFile(join(workspace, 'Dockerfile'), 'FROM node\n', 'utf8');

		const { name, meta, handler } = await capture(
			buildContainerLintToolRegistrations({
				namespacePrefix: 'container',
				workspaceRootAbs: workspace,
			} satisfies IContainerLintToolOptions),
			'container_lint',
		);

		expect(name).toBe('container_container_lint');
		expect(meta.inputSchema).toBeDefined();
		await expect(call(handler, {})).resolves.toEqual({
			ok: true,
			findings: [
				{
					ruleId: 'DL3001',
					severity: 'low',
					message:
						'Pin the base image to a non-latest tag or digest.',
					fix: 'Use a specific tag like `node:20-alpine` or a digest.',
					location: { file: 'Dockerfile', line: 1 },
				},
			],
		});
	});

	it('returns containment-violation for escaped dockerfile paths', async () => {
		const { handler } = await capture(
			buildContainerLintToolRegistrations({
				namespacePrefix: 'container',
				workspaceRootAbs: '/workspace',
				readDockerfile: async () => 'FROM alpine:3.20\n',
			}),
			'container_lint',
		);

		await expect(
			call(handler, { dockerfilePath: '../outside/Dockerfile' }),
		).resolves.toEqual(
			expect.objectContaining({
				error: expect.objectContaining({
					reason: 'containment-violation',
				}),
			}),
		);
	});

	it('returns not-found when the target Dockerfile is missing', async () => {
		const workspace = await mkdtemp(join(tmpdir(), 'container-plugin-'));
		tempDirs.push(workspace);

		const { handler } = await capture(
			buildContainerLintToolRegistrations({
				namespacePrefix: 'container',
				workspaceRootAbs: workspace,
			} satisfies IContainerLintToolOptions),
			'container_lint',
		);

		await expect(call(handler, {})).resolves.toEqual(
			expect.objectContaining({
				error: expect.objectContaining({ reason: 'not-found' }),
			}),
		);
	});
});
