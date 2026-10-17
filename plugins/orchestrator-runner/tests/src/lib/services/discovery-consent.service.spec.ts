import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ConsentAsk } from '../../../../src/lib/contracts/interfaces/discovery-consent.interface';
import { discoveryConsent } from '../../../../src/lib/services/discovery-consent.service';

const consentPath = (): string =>
	join(mkdtempSync(join(tmpdir(), 'discovery-consent-')), 'consent.json');

/** An ask that answers in turn and counts how often it was put. */
const answering = (...answers: ('accept' | 'decline' | 'unavailable')[]) => {
	const asked: string[] = [];
	const ask: ConsentAsk = async (question) => {
		asked.push(question);
		return answers.shift() ?? 'unavailable';
	};
	return { ask, asked };
};

describe('discoveryConsent', () => {
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
