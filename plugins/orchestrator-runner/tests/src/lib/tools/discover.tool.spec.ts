import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFakeToolServer } from '@delendai/test-kit/public';
import { describe, expect, it } from 'vitest';

import type { ProbeRunner } from '../../../../src/lib/healthcheck/probe';
import { buildDiscoverProvidersRegistration } from '../../../../src/lib/tools/discover.tool';

type Handler = () => Promise<{ structuredContent?: Record<string, unknown> }>;

const discoverWith = async (elicitation: 'none' | 'accept' | 'decline') => {
	const probes: string[] = [];
	const runner: ProbeRunner = async (command) => {
		probes.push(command);
		return { code: 1, output: '' };
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

	it('probes once the user says yes', async () => {
		const { probes, consent } = await discoverWith('accept');
		expect(consent.state).toBe('granted');
		expect(probes.length).toBeGreaterThan(0);
	});
});
