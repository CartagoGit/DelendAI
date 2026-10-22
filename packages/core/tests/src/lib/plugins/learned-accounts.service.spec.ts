/**
 * learned-accounts.service.spec.ts — a person's answers are kept,
 * privately, and merged.
 */
import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	learnAccounts,
	learnedAccountsPath,
	readLearnedAccounts,
} from '../../../../src/lib/plugins/learned-accounts.service';

const qwen = {
	vendor: 'qwen',
	credentialMode: 'byok-api-key',
	billingMode: 'pay-as-you-go',
} as const;

describe('learned accounts', () => {
	it('keeps answers privately and merges later ones', async () => {
		const path = learnedAccountsPath(
			mkdtempSync(join(tmpdir(), 'learned-')),
		);
		expect(await readLearnedAccounts(path)).toEqual({});
		await learnAccounts(path, {});
		await learnAccounts(path, { 'seen-models:qwen': qwen });
		await learnAccounts(path, {
			'credential-variable:X_API_KEY': { ...qwen, vendor: 'x' },
		});
		expect(Object.keys(await readLearnedAccounts(path))).toEqual([
			'seen-models:qwen',
			'credential-variable:X_API_KEY',
		]);
		if (process.platform !== 'win32')
			expect(statSync(path).mode & 0o777).toBe(0o600);
	});

	it('reads nothing from a file it cannot parse', async () => {
		const path = join(
			mkdtempSync(join(tmpdir(), 'learned-bad-')),
			'l.json',
		);
		writeFileSync(path, '{ nope');
		expect(await readLearnedAccounts(path)).toEqual({});
		writeFileSync(
			path,
			JSON.stringify({ classifications: { k: { vendor: '' } } }),
		);
		expect(await readLearnedAccounts(path)).toEqual({});
	});
});
