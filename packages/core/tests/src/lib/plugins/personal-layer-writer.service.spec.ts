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
				accounts: [account('a', 'mine')],
				providers: [{ id: 'p', accountId: 'a' }],
				declinedOffers: ['x', 'x'],
			}),
		).toEqual({ accounts: 1, providers: 1, declinedOffers: 1 });
		expect(
			await addToPersonalLayer(file, {
				accounts: [account('a', 'replacement'), account('b', 'new')],
				providers: [{ id: 'p', accountId: 'b' }],
				declinedOffers: ['x'],
			}),
		).toEqual({ accounts: 1, providers: 0, declinedOffers: 0 });
		const written = JSON.parse(readFileSync(file, 'utf8')) as {
			accounts: { accountId: string; displayName: string }[];
			providers: { id: string; accountId: string }[];
		};
		expect(written.accounts.map((each) => each.displayName)).toEqual([
			'mine',
			'new',
		]);
		expect(written.providers).toEqual([{ id: 'p', accountId: 'a' }]);
	});

	it('writes nothing when nothing is new, and refuses a file that does not parse', async () => {
		const file = target();
		expect(await addToPersonalLayer(file, {})).toEqual({
			accounts: 0,
			providers: 0,
			declinedOffers: 0,
		});
		expect(() => readFileSync(file, 'utf8')).toThrow();
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, '{ nope');
		await expect(
			addToPersonalLayer(file, { declinedOffers: ['x'] }),
		).rejects.toThrow(/does not parse/u);
		expect(readFileSync(file, 'utf8')).toBe('{ nope');
	});
});
