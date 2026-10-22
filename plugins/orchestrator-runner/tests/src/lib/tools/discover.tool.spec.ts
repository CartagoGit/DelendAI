import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFakeToolServer } from '@delendai/test-kit/public';
import { describe, expect, it } from 'vitest';

import type { IProviderCapabilities } from '@delendai/core/public';

import type { ProbeRunner } from '../../../../src/lib/healthcheck/probe';
import { buildDiscoverProvidersRegistration } from '../../../../src/lib/tools/discover.tool';

type Handler = () => Promise<{ structuredContent?: Record<string, unknown> }>;

const discoverWith = async (
	elicitation: 'none' | 'accept' | 'decline',
	answers: Record<string, { code: number; output: string }> = {},
	proposed: readonly IProviderCapabilities[] = [],
) => {
	const probes: string[] = [];
	const runner: ProbeRunner = async (command) => {
		probes.push(command);
		return answers[command] ?? { code: 1, output: '' };
	};
	let handler: Handler | undefined;
	const server = createFakeToolServer({
		onRegisterTool: (registered) => {
			handler = registered.handler as Handler;
		},
		...(elicitation === 'none' ? {} : { elicitation }),
	});
	await buildDiscoverProvidersRegistration({
		namespacePrefix: 'mcp',
		workspaceRoot: '/workspace',
		runner,
		discovery: 'auto-with-consent',
		propose: async () => proposed,
		consentPath: join(
			mkdtempSync(join(tmpdir(), 'discover-tool-')),
			'consent.json',
		),
	}).register(server);
	if (handler === undefined) throw new Error('the tool never registered');
	const result = await handler();
	return {
		probes,
		consent: result.structuredContent?.consent as { state: string },
		proposed: result.structuredContent?.proposed as
			| readonly IProviderCapabilities[]
			| undefined,
		detected: result.structuredContent?.detected as readonly {
			id: string;
			models?: { listed: boolean; providers: unknown[] };
		}[],
	};
};

describe('discover_providers', () => {
	it('runs no probe when the host cannot ask the user', async () => {
		const { probes, consent } = await discoverWith('none');
		expect(consent.state).toBe('unavailable');
		expect(probes).toEqual([]);
	});

	it('runs no probe when the user says no', async () => {
		const { probes, consent } = await discoverWith('decline');
		expect(consent.state).toBe('declined');
		expect(probes).toEqual([]);
	});

	it('proposes roster entries for detected agents and set keys only after a yes', async () => {
		const entry: IProviderCapabilities = {
			id: 'acp-opencode',
			kind: 'acp',
			invoke: { kind: 'acp', agent: 'opencode' },
			modelId: 'opencode',
			contextWindow: 200_000,
			costTier: 3,
			strengths: ['code-edit'],
			weaknesses: [],
		};
		expect((await discoverWith('accept', {}, [entry])).proposed).toEqual([
			entry,
		]);
		expect(
			(await discoverWith('decline', {}, [entry])).proposed,
		).toBeUndefined();
		expect((await discoverWith('accept', {}, [])).proposed).toBeUndefined();
	});

	it('probes once the user says yes', async () => {
		const { probes, consent } = await discoverWith('accept');
		expect(consent.state).toBe('granted');
		expect(probes.length).toBeGreaterThan(0);
	});

	it('lists the models a host client reaches, by provider', async () => {
		const { detected } = await discoverWith('accept', {
			'command -v opencode': { code: 0, output: '/bin/opencode' },
			'opencode --version': { code: 0, output: '1.15.13' },
			'opencode models': {
				code: 0,
				output: 'minimax/MiniMax-M3\nopencode/big-pickle\n',
			},
			'command -v claude': { code: 0, output: '/bin/claude' },
		});
		expect(detected.find((each) => each.id === 'opencode')?.models).toEqual(
			{
				listed: true,
				providers: [
					{ provider: 'minimax', models: ['MiniMax-M3'] },
					{ provider: 'opencode', models: ['big-pickle'] },
				],
			},
		);
		expect(
			detected.find((each) => each.id === 'claude')?.models,
		).toBeUndefined();
	});
});
