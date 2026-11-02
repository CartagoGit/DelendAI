/**
 * personal-layer-writer.service.spec.ts — the one writer of a person's
 * project file keeps what they declared and refuses a file it cannot read.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { addToPersonalLayer } from '../../../../src/lib/plugins/personal-layer-writer.service';

const target = () =>
	join(mkdtempSync(join(tmpdir(), 'personal-writer-')), 'projects', 'p.json');

const account = (accountId: string, displayName: string) => ({
	accountId,
	vendor: 'anthropic',
	displayName,
	credentialMode: 'official-subscription-login',
	billingMode: 'subscription-included',
});

describe('addToPersonalLayer', () => {
	it('adds only what is new, and keeps what the person declared', async () => {
		const file = target();
		expect(
			await addToPersonalLayer(file, {
				accounts: [account('acct-a', 'mine')],
				providers: [{ id: 'p', accountId: 'acct-a' }],
				declinedOffers: ['x', 'x'],
				agents: [{ id: 'mine', kind: 'acp', command: 'mine' }],
			}),
		).toEqual({ accounts: 1, providers: 1, declinedOffers: 1, agents: 1 });
		expect(
			await addToPersonalLayer(file, {
				accounts: [
					account('acct-a', 'replacement'),
					account('acct-b', 'new'),
				],
				providers: [{ id: 'p', accountId: 'acct-b' }],
				declinedOffers: ['x'],
				agents: [{ id: 'mine', kind: 'cli', command: 'other' }],
			}),
		).toEqual({ accounts: 1, providers: 0, declinedOffers: 0, agents: 0 });
		const written = JSON.parse(readFileSync(file, 'utf8')) as {
			accounts: { accountId: string; displayName: string }[];
			providers: { id: string; accountId: string }[];
			agents: { id: string; kind: string }[];
		};
		expect(written.agents).toEqual([
			{ id: 'mine', kind: 'acp', command: 'mine' },
		]);
		expect(written.accounts.map((each) => each.displayName)).toEqual([
			'mine',
			'new',
		]);
		expect(written.providers).toEqual([{ id: 'p', accountId: 'acct-a' }]);
	});

	it('writes nothing when nothing is new, and refuses a file that does not parse', async () => {
		const file = target();
		expect(await addToPersonalLayer(file, {})).toEqual({
			accounts: 0,
			providers: 0,
			declinedOffers: 0,
			agents: 0,
		});
		expect(() => readFileSync(file, 'utf8')).toThrow();
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, '{ nope');
		await expect(
			addToPersonalLayer(file, { declinedOffers: ['x'] }),
		).rejects.toThrow(/does not parse/u);
		expect(readFileSync(file, 'utf8')).toBe('{ nope');
	});

	it('refuses an addition that would not read back, and writes nothing', async () => {
		const file = target();
		await expect(
			addToPersonalLayer(file, { accounts: [account('X', 'bad id')] }),
		).rejects.toThrow(/not written/u);
		expect(() => readFileSync(file, 'utf8')).toThrow();
	});
});
