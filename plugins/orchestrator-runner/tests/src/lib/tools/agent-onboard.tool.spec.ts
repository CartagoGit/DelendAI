/**
 * agent-onboard.tool.spec.ts — onboarding any agent: plan finds it or
 * drafts it, apply writes it, prove spends one prompt only with consent.
 */
import { createFakeToolServer } from '@delendai/test-kit';
import { describe, expect, it, vi } from 'vitest';

import type { IOnboardAgentFlows } from '../../../../src/lib/contracts/interfaces/onboard-agent.interface';
import {
	buildOnboardAgentRegistration,
	onboardAgent,
} from '../../../../src/lib/tools/agent-onboard.tool';

const opencode = {
	id: 'opencode',
	name: 'OpenCode',
	kind: 'acp' as const,
	origin: 'detected' as const,
	launch: { command: 'opencode', args: ['acp'] },
	found: [],
};

const flows = (over: Partial<IOnboardAgentFlows> = {}): IOnboardAgentFlows => ({
	listAgents: vi.fn(async () => ({ agents: [opencode], detected: [] })),
	declareAgent: vi.fn(async () => ({
		personalLayer: '/p.json',
		added: true,
		agent: { id: 'mytool', kind: 'acp' as const, command: 'mytool' },
	})),
	introduceAgent: vi.fn(async () => ({
		agent: { name: 'OpenCode', version: '1' },
		protocolVersion: 1,
		authMethods: [],
		loadSession: false,
		promptCapabilities: [],
	})),
	writeAgentUsagePage: vi.fn(async () => ({
		path: '/ws/docs/delendai/models/x.md',
		written: true,
		reason: 'new',
	})),
	runAcpAgent: vi.fn(async () => ({
		agent: {},
		protocolVersion: 1,
		authMethods: [],
		modes: [],
		stopReason: 'end_turn',
		text: 'ready'.repeat(200),
	})),
	help: vi.fn(async () => 'Usage: mytool [--acp]\nSpeaks ACP over stdio'),
	...over,
});

describe('onboardAgent', () => {
	it('plans a known agent by greeting it, at no cost', async () => {
		const f = flows();
		const out = await onboardAgent(
			{ target: 'OpenCode', mode: 'plan' },
			'/ws',
			f,
		);
		expect(out).toMatchObject({
			known: true,
			introduction: { agent: { name: 'OpenCode' } },
		});
		expect(f.runAcpAgent).not.toHaveBeenCalled();
	});

	it('drafts an unknown command from its own help, and a URL as http', async () => {
		const out = await onboardAgent(
			{ target: '/opt/bin/MyTool', mode: 'plan' },
			'/ws',
			flows(),
		);
		expect(out).toMatchObject({
			known: false,
			draft: { id: 'mytool', kind: 'acp', command: '/opt/bin/MyTool' },
		});
		expect(out.help).toContain('Speaks ACP');
		const web = await onboardAgent(
			{ target: 'https://bot.example.test/v1', mode: 'plan' },
			'/ws',
			flows(),
		);
		expect(web.draft).toEqual({
			id: 'bot-example-test',
			kind: 'http',
			url: 'https://bot.example.test/v1',
		});
		const cli = await onboardAgent(
			{ target: 'plain', mode: 'plan' },
			'/ws',
			flows({ help: async () => 'no protocol here' }),
		);
		expect(cli.draft?.kind).toBe('cli');
	});

	it('applies a declaration and writes its usage page', async () => {
		const f = flows({
			listAgents: vi.fn(async () => ({
				agents: [{ ...opencode, id: 'mytool' }],
				detected: [],
			})),
		});
		const out = await onboardAgent(
			{
				target: 'mytool',
				mode: 'apply',
				declaration: { id: 'mytool', kind: 'acp', command: 'mytool' },
			},
			'/ws',
			f,
		);
		expect(out).toMatchObject({ known: true, page: { written: true } });
		expect(out.nextAction).toContain('accounts offer');
		expect(
			(await onboardAgent({ target: 'mytool', mode: 'apply' }, '/ws', f))
				.nextAction,
		).toContain('declaration');
	});

	it('proves only with consent, refusing permissions, and trims what it says', async () => {
		const f = flows();
		expect(
			(
				await onboardAgent(
					{ target: 'opencode', mode: 'prove' },
					'/ws',
					f,
				)
			).nextAction,
		).toContain('consent');
		expect(f.runAcpAgent).not.toHaveBeenCalled();
		const out = await onboardAgent(
			{ target: 'opencode', mode: 'prove', consent: true },
			'/ws',
			f,
		);
		expect(out.nextAction).toContain('the project can use it');
		expect(String((out.proof as { text: string }).text).length).toBe(500);
		const stopped = await onboardAgent(
			{ target: 'opencode', mode: 'prove', consent: true },
			'/ws',
			flows({
				runAcpAgent: vi.fn(async () => ({
					agent: {},
					protocolVersion: 1,
					authMethods: [],
					modes: [],
					stopReason: 'refusal',
					text: '',
				})),
			}),
		);
		expect(stopped.nextAction).toContain('refusal');
		const nolaunch = flows({
			listAgents: vi.fn(async () => ({
				agents: [{ ...opencode, launch: undefined }],
				detected: [],
			})),
		});
		expect(
			(
				await onboardAgent(
					{ target: 'opencode', mode: 'prove', consent: true },
					'/ws',
					nolaunch,
				)
			).nextAction,
		).toContain('cannot start');
	});

	it('registers a tool with effects and an output schema', async () => {
		const registration = buildOnboardAgentRegistration({
			namespacePrefix: 'delendai_orchestrator-runner',
			workspaceRoot: '/ws',
			flows: flows(),
		});
		expect(registration.effects).toEqual(['spawn', 'write', 'network']);
		const registered: string[] = [];
		await registration.register(
			createFakeToolServer({
				onRegisterTool: ({ name, config }) => {
					registered.push(name);
					expect(
						(config as { outputSchema?: unknown }).outputSchema,
					).toBeDefined();
				},
			}),
		);
		expect(registered).toEqual([
			'delendai_orchestrator-runner_onboard_agent',
		]);
	});
});
