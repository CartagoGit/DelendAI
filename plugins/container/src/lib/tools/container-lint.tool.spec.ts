import { describe, expect, it } from 'vitest';

import type { IArgvExec, IProbeDeps } from '@mcp-vertex/core/public';

import { buildContainerLintToolRegistrations } from './container-lint.tool';

const mountHandlers = async (probeDeps: IProbeDeps, runExec: IArgvExec) => {
	const registrations = buildContainerLintToolRegistrations({
		namespacePrefix: 'container',
		probeDeps,
		runExec,
	});
	const tools: Record<
		string,
		(args: unknown) => Promise<{ content: Array<{ text: string }> }>
	> = {};
	const server = {
		tools,
		registerTool: (
			name: string,
			_meta: unknown,
			handler: (
				args: unknown,
			) => Promise<{ content: Array<{ text: string }> }>,
		) => {
			tools[name] = handler;
			return { dispose: () => undefined } as never;
		},
	};
	for (const r of registrations) {
		await r.register(server as never);
	}
	const lint = tools['container_container_lint'];
	const logs = tools['container_container_logs'];
	if (lint === undefined || logs === undefined) {
		throw new Error('container lint/logs handlers were not registered');
	}
	return { lint, logs };
};

const probeDepsAvailable = (bin: string): IProbeDeps => ({
	commandExists: async (b: string) => b === bin,
	runVersion: async () => '1.0.0',
});

const probeDepsMissing: IProbeDeps = {
	commandExists: async () => false,
	runVersion: async () => '',
};

const execWith = (stdout: string, code = 0): IArgvExec => {
	const calls: { argv: readonly string[] }[] = [];
	const fn: IArgvExec = async (argv) => {
		calls.push({ argv });
		return { code, stdout, stderr: '', timedOut: false };
	};
	(fn as unknown as { calls: typeof calls }).calls = calls;
	return fn;
};

const parseBody = (raw: unknown): Record<string, unknown> => {
	const content = (raw as { content: Array<{ text: string }> }).content;
	return JSON.parse(content[0]?.text ?? '{}') as Record<string, unknown>;
};

describe('f00133 S2 container-lint tool', () => {
	it('container_lint returns ok + builtin engine when hadolint is missing', async () => {
		const { lint } = await mountHandlers(probeDepsMissing, execWith(''));
		const body = parseBody(
			await lint({ source: 'FROM alpine\nCMD ["x"]\n' }),
		);
		expect(body['ok']).toBe(true);
		expect(body['engine']).toBe('builtin');
		expect(body['hadolintAvailable']).toBe(false);
	});

	it('container_logs returns skipped when docker is missing', async () => {
		const { logs } = await mountHandlers(probeDepsMissing, execWith(''));
		const body = parseBody(await logs({ kind: 'docker', target: 'web' }));
		expect(body['ok']).toBe(false);
		expect(body['kind']).toBe('skipped');
	});

	it('container_logs tails docker output', async () => {
		const exec = execWith('line one\nline two\n');
		const { logs } = await mountHandlers(
			probeDepsAvailable('docker'),
			exec,
		);
		const body = parseBody(
			await logs({ kind: 'docker', target: 'web', tail: 50 }),
		);
		expect(body['ok']).toBe(true);
		expect(body['logs']).toBe('line one\nline two\n');
	});

	it('container_logs tails kubectl pods', async () => {
		const exec = execWith('pod-log-line\n');
		const { logs } = await mountHandlers(
			probeDepsAvailable('kubectl'),
			exec,
		);
		const body = parseBody(
			await logs({
				kind: 'kubectl',
				target: 'web-0',
				namespace: 'prod',
				tail: 200,
			}),
		);
		expect(body['ok']).toBe(true);
		const calls = (
			exec as unknown as { calls: { argv: readonly string[] }[] }
		).calls;
		expect(calls[0]?.argv).toEqual([
			'kubectl',
			'logs',
			'--tail',
			'200',
			'-n',
			'prod',
			'web-0',
		]);
	});

	it('exposes two tool registrations under the namespace prefix', () => {
		const regs = buildContainerLintToolRegistrations({
			namespacePrefix: 'container',
			probeDeps: probeDepsAvailable('docker'),
			runExec: execWith(''),
		});
		expect(regs.map((r) => r.id)).toEqual([
			'container_lint',
			'container_logs',
		]);
	});
});
