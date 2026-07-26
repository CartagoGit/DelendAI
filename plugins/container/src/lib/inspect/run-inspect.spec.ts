import { describe, expect, it } from 'vitest';

import { runInspect } from './run-inspect';
import type { IContainerInspectDeps } from './types';

describe('runInspect', () => {
	it('returns skipped with a hint when docker is missing', async () => {
		const deps: IContainerInspectDeps = {
			probeBinary: async () => ({
				present: false,
				hint: 'install docker',
			}),
			exec: async () => ({ stdout: '', stderr: '' }),
		};

		await expect(runInspect({ kind: 'docker-ps' }, deps)).resolves.toEqual({
			kind: 'skipped',
			hint: 'install docker',
			cliPresent: false,
		});
	});

	it('returns parsed docker container items when docker is present', async () => {
		const deps: IContainerInspectDeps = {
			probeBinary: async () => ({ present: true }),
			exec: async (cmd) => {
				expect(cmd).toEqual(['docker', 'ps', '--format', '{{json .}}']);
				return {
					stdout: '{"ID":"abc123","Names":"web","Image":"nginx:1.27","Status":"Up","Ports":"80/tcp","CreatedAt":"2026-07-26T12:00:00Z"}',
					stderr: '',
				};
			},
		};

		await expect(runInspect({ kind: 'docker-ps' }, deps)).resolves.toEqual({
			kind: 'docker-ps',
			items: [
				{
					id: 'abc123',
					name: 'web',
					image: 'nginx:1.27',
					status: 'Up',
					ports: ['80/tcp'],
					createdAt: '2026-07-26T12:00:00.000Z',
				},
			],
			cliPresent: true,
		});
	});

	it('passes the requested namespace through to kubectl', async () => {
		const calls: Array<readonly string[]> = [];
		const deps: IContainerInspectDeps = {
			probeBinary: async () => ({ present: true }),
			exec: async (cmd) => {
				calls.push(cmd);
				return {
					stdout: JSON.stringify({
						items: [
							{
								metadata: {
									name: 'api-0',
									namespace: 'team-a',
								},
								spec: { containers: [{ name: 'api' }] },
								status: { phase: 'Running' },
							},
						],
					}),
					stderr: '',
				};
			},
		};

		const result = await runInspect(
			{ kind: 'k8s-get', namespace: 'team-a' },
			deps,
		);
		expect(calls).toEqual([
			['kubectl', '-n', 'team-a', 'get', 'pods', '-o', 'json'],
		]);
		expect(result).toEqual({
			kind: 'k8s-get',
			items: [
				{
					name: 'api-0',
					namespace: 'team-a',
					status: 'Running',
					containers: ['api'],
				},
			],
			cliPresent: true,
		});
	});
});
