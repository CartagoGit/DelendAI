import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';

import type { ProbeRunner } from '../../../../src/lib/healthcheck/probe';
import { buildDiscoverProvidersRegistration } from '../../../../src/lib/tools/discover.tool';

type Handler = () => Promise<{ structuredContent?: Record<string, unknown> }>;

/** A server whose client may or may not offer elicitation, answering `action`. */
const serverWith = (elicitation: 'none' | 'accept' | 'decline') => {
	let handler: Handler | undefined;
	const server = {
		registerTool: (_name: string, _config: unknown, h: Handler) => {
			handler = h;
		},
		server: {
			getClientCapabilities: () =>
				elicitation === 'none' ? {} : { elicitation: {} },
			elicitInput: async () => ({ action: elicitation }),
		},
	} as unknown as McpServer;
	return { server, call: () => (handler as Handler)() };
};

const discoverWith = async (elicitation: 'none' | 'accept' | 'decline') => {
	const probes: string[] = [];
	const runner: ProbeRunner = async (command) => {
		probes.push(command);
		return { code: 1, output: '' };
	};
	const { server, call } = serverWith(elicitation);
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
	const result = await call();
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
