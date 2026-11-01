import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { recordDiscoveryConsent } from '@delendai/core/runtime';
import { fakePartial } from '@delendai/test-kit';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IConsentAsk } from '../../../../src/lib/contracts/interfaces/discovery-consent.interface';
import {
	askThroughElicitation,
	discoveryConsent,
} from '../../../../src/lib/services/discovery-consent.service';

const consentPath = (): string =>
	join(mkdtempSync(join(tmpdir(), 'discovery-consent-')), 'consent.json');

/** An ask that answers in turn and counts how often it was put. */
const answering = (...answers: ('accept' | 'decline' | 'unavailable')[]) => {
	const asked: string[] = [];
	const ask: IConsentAsk = async (question) => {
		asked.push(question);
		return answers.shift() ?? 'unavailable';
	};
	return { ask, asked };
};

describe('discoveryConsent', () => {
	it('takes an answer given in a terminal, a no as well as a yes, without asking', async () => {
		const path = consentPath();
		const user = answering('accept');
		await recordDiscoveryConsent(path, 'declined', new Date(0));
		const declined = await discoveryConsent({
			mode: 'auto-with-consent',
			consentPath: path,
			ask: user.ask,
		});
		expect(declined.state).toBe('declined');
		expect(declined.next).toContain('delendai accounts consent');
		expect(user.asked).toHaveLength(0);
	});

	it('reads a record written before answers were kept both ways as a yes', async () => {
		const path = consentPath();
		writeFileSync(
			path,
			JSON.stringify({
				schema: 'delendai/orchestrator-runner/discovery-consent/1',
				grantedAt: '2026-10-28T04:00:00.000Z',
			}),
		);
		const user = answering();
		expect(
			(
				await discoveryConsent({
					mode: 'auto-with-consent',
					consentPath: path,
					ask: user.ask,
				})
			).state,
		).toBe('granted');
	});

	it('tells a host that declined how the person can still answer', async () => {
		const user = answering('decline');
		const result = await discoveryConsent({
			mode: 'auto-with-consent',
			consentPath: consentPath(),
			ask: user.ask,
		});
		expect(result.next).toContain('delendai accounts consent --yes|--no');
	});

	it('asks once: a yes is recorded and not asked again', async () => {
		const path = consentPath();
		const user = answering('accept');
		const first = await discoveryConsent({
			mode: 'auto-with-consent',
			consentPath: path,
			ask: user.ask,
		});
		const second = await discoveryConsent({
			mode: 'auto-with-consent',
			consentPath: path,
			ask: user.ask,
		});
		expect([first.state, second.state]).toEqual(['granted', 'granted']);
		expect(user.asked).toHaveLength(1);
	});

	it('keeps a no unrecorded, points at onboarding by questions, and asks again later', async () => {
		const path = consentPath();
		const user = answering('decline', 'accept');
		const first = await discoveryConsent({
			mode: 'auto-with-consent',
			consentPath: path,
			ask: user.ask,
		});
		expect(first.state).toBe('declined');
		expect(first.next).toContain('Onboard by questions');
		const second = await discoveryConsent({
			mode: 'auto-with-consent',
			consentPath: path,
			ask: user.ask,
		});
		expect(second.state).toBe('granted');
	});

	it('probes nothing when the host cannot ask', async () => {
		const user = answering('unavailable');
		const consent = await discoveryConsent({
			mode: 'auto-with-consent',
			consentPath: consentPath(),
			ask: user.ask,
		});
		expect(consent.state).toBe('unavailable');
		expect(consent.next).toContain('no MCP elicitation');
		expect(consent.next).toContain('delendai accounts consent');
	});

	it('never asks under manual or off', async () => {
		const user = answering('accept');
		const manual = await discoveryConsent({
			mode: 'manual',
			consentPath: consentPath(),
			ask: user.ask,
		});
		const off = await discoveryConsent({
			mode: 'off',
			consentPath: consentPath(),
			ask: user.ask,
		});
		expect([manual.state, off.state]).toEqual(['manual', 'off']);
		expect(user.asked).toEqual([]);
	});
});

describe('askThroughElicitation', () => {
	const serverWith = (
		elicitation: object | undefined,
		elicitInput: () => Promise<{ action: string }>,
	): McpServer =>
		fakePartial<McpServer>({
			server: fakePartial<McpServer['server']>({
				getClientCapabilities: () =>
					elicitation === undefined ? {} : { elicitation },
				elicitInput:
					fakePartial<McpServer['server']['elicitInput']>(
						elicitInput,
					),
			}),
		});

	it('is unavailable without the client capability', async () => {
		const ask = askThroughElicitation(
			serverWith(undefined, async () => ({ action: 'accept' })),
		);
		expect(await ask('may I?')).toBe('unavailable');
	});

	it.each([
		['accept', 'accept'],
		['decline', 'decline'],
		['cancel', 'decline'],
	])('reads %s as %s', async (action, answer) => {
		const ask = askThroughElicitation(
			serverWith({}, async () => ({ action })),
		);
		expect(await ask('may I?')).toBe(answer);
	});

	it('is unavailable when the host fails to ask', async () => {
		const ask = askThroughElicitation(
			serverWith({}, async () => {
				throw new Error('no client');
			}),
		);
		expect(await ask('may I?')).toBe('unavailable');
	});
});
