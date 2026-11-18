/**
 * acp-invoker.service.spec.ts — a hop on an ACP agent: the invoker alone,
 * and a full invoke through the manager to a real process over stdio.
 */
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it, vi } from 'vitest';

import type { IProviderCapabilities } from '@delendai/core/public';

import {
	createAcpInvoker,
	permissionVerdict,
	permittedBy,
} from '../../../../src/lib/invoke/acp-invoker.service';
import { InvocationManager } from '../../../../src/lib/invoke/manager';
import type {
	IInvokeRequest,
	IKindInvoker,
} from '../../../../src/lib/invoke/types';

const FAKE = join(import.meta.dirname, 'fixtures', 'fake-acp-coder.ts');

const coder: IProviderCapabilities = {
	id: 'fake-coder',
	kind: 'acp',
	invoke: { kind: 'acp', command: process.execPath, args: [FAKE] },
	modelId: 'fake-coder',
	contextWindow: 100_000,
	costTier: 1,
	strengths: ['code-edit'],
	weaknesses: [],
};

const request = (
	invoke: IInvokeRequest['invoke'],
	toolsAllow?: string[],
): IInvokeRequest => ({
	invocationId: 'i1',
	decision: fakePartial<IInvokeRequest['decision']>({
		targetProvider: coder,
	}),
	invoke,
	prompt: 'fix it',
	...(toolsAllow === undefined ? {} : { toolsAllow }),
});

describe('permittedBy', () => {
	it('grants by the structured tool kind only, never by the title', () => {
		expect(
			permittedBy({ title: 'Read src/x.ts', kind: 'read', options: [] }, [
				'Read',
			]),
		).toBe(true);
		expect(
			permittedBy(
				{ title: 'Bash: rm -rf', kind: 'execute', options: [] },
				['Read'],
			),
		).toBe(false);
		expect(
			permittedBy(
				{ title: 'Read', kind: 'read', options: [] },
				undefined,
			),
		).toBe(false);
	});

	it('refuses a title that names an allowed tool when the operation is another one', () => {
		const ask = {
			title: 'Bash: run something after Read',
			kind: 'execute',
			options: [],
		};
		expect(permissionVerdict(ask, ['Read'])).toEqual({
			granted: false,
			why: 'tool kind execute is not in the allowed tools (Read)',
		});
	});

	it('refuses a request with no structured identity, and says why', () => {
		expect(
			permissionVerdict({ title: 'Read src/x.ts', options: [] }, [
				'Read',
			]),
		).toEqual({
			granted: false,
			why: 'the request names no tool kind, and its title is not evidence',
		});
		expect(
			permittedBy({ title: 'Read', kind: 'other', options: [] }, [
				'Read',
				'other',
			]),
		).toBe(false);
	});
});

describe('createAcpInvoker', () => {
	it('starts a registry agent by id, found once for every hop', async () => {
		const listAgents = vi.fn(async () => ({
			agents: [
				{
					id: 'opencode',
					name: 'OpenCode',
					kind: 'acp' as const,
					origin: 'detected' as const,
					launch: { command: 'opencode', args: ['acp'] },
					found: [],
				},
			],
			detected: [],
			candidates: [],
		}));
		const run = vi.fn(async () => ({
			agent: {},
			protocolVersion: 1,
			authMethods: [],
			modes: [],
			stopReason: 'end_turn',
			text: 'ok',
		}));
		const invoker = createAcpInvoker({ cwd: '/ws', listAgents, run });
		await invoker.start(request({ kind: 'acp', agent: 'opencode' }))
			.promise;
		await invoker.start(request({ kind: 'acp', agent: 'opencode' }))
			.promise;
		expect(listAgents).toHaveBeenCalledTimes(1);
		expect(run).toHaveBeenCalledWith(
			{ command: 'opencode', args: ['acp'] },
			expect.objectContaining({ cwd: '/ws', prompt: 'fix it' }),
		);
	});

	it('fails a hop whose agent cannot start, and one of another kind', async () => {
		const invoker = createAcpInvoker({
			cwd: '/ws',
			listAgents: async () => ({
				agents: [],
				detected: [],
				candidates: [],
			}),
			run: vi.fn(),
		});
		await expect(
			invoker.start(request({ kind: 'acp', agent: 'nope' })).promise,
		).rejects.toThrow('cannot start here');
		await expect(
			invoker.start(request({ kind: 'cli', command: 'x' })).promise,
		).rejects.toThrow('acp invoker got a cli');
	});
});

describe('an agent fetched from the network', () => {
	const listed = (agent: Record<string, unknown>) =>
		vi.fn(async () => ({
			agents: [
				{
					id: 'coder',
					name: 'Coder',
					kind: 'acp' as const,
					origin: 'registry' as const,
					found: [],
					...agent,
				},
			],
			detected: [],
			candidates: [],
		}));
	const run = vi.fn(async () => ({
		agent: {},
		protocolVersion: 1,
		authMethods: [],
		modes: [],
		stopReason: 'end_turn',
		text: 'ok',
	}));

	it('is refused with the setting that allows it, when the project did not allow its package', async () => {
		const invoker = createAcpInvoker({
			cwd: '/ws',
			listAgents: listed({
				refusal:
					'coder would be fetched from the network (npx @q/coder@2) and this project has not allowed that package: add "@q/coder@2" to `trustedAgentPackages` in delendai.config.json, or install the agent',
			}),
			run,
		});
		await expect(
			invoker.start(request({ kind: 'acp', agent: 'coder' })).promise,
		).rejects.toThrow('`trustedAgentPackages`');
	});

	it('says the run came from the network', async () => {
		const invoker = createAcpInvoker({
			cwd: '/ws',
			listAgents: listed({
				launch: {
					command: 'npx',
					args: ['-y', '@q/coder@2'],
					fromNetwork: 'npx @q/coder@2',
				},
			}),
			run,
		});
		const out = await invoker.start(
			request({ kind: 'acp', agent: 'coder' }),
		).promise;
		expect(out.structuredContent).toMatchObject({
			fetchedFromNetwork: 'npx @q/coder@2',
		});
	});
});

describe('an acp hop through the manager', () => {
	const manager = (acp: IKindInvoker) =>
		new InvocationManager({
			providers: [coder],
			availabilityOf: (id) => ({ id, state: 'available' }),
			invokers: {
				acp,
				cli: acp,
				api: acp,
				'mcp-server': acp,
				subscription: acp,
				'host-sampling': acp,
			},
			defaultCostPreference: 'balanced',
			invokeTimeoutMs: 20_000,
			maxFallbackDepth: 1,
			fallbackStrategy: 'rerank',
			executeApi: true,
			confirmBeforeExecute: false,
			autoBypassConfirmed: true,
		});

	it('runs the task on a real agent over stdio: streamed text, usage, a refused permission', async () => {
		const out = await manager(createAcpInvoker({ cwd: tmpdir() })).invoke({
			task: 'fix the build',
			toolsAllow: ['Read'],
		});
		expect(out.error).toBeUndefined();
		expect(out.result?.text).toBe('task=fix the build bash=no read=yes');
		expect(out.result?.usage).toEqual({
			inputTokens: 7,
			outputTokens: 3,
			totalTokens: 10,
		});
		expect(out.result?.structuredContent).toMatchObject({
			stopReason: 'end_turn',
			refusedPermissions: [
				'Bash: rm -rf build (tool kind execute is not in the allowed tools (Read))',
			],
		});
	});
});
