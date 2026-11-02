/**
 * address-policy.spec.ts — an allow-listed name is only as good as the
 * address it resolves to.
 */
import { describe, expect, it } from 'vitest';

import type { IFetchLike } from '../../../../src/lib/contracts/interfaces/fetch.interface';
import {
	isPrivateAddress,
	refusedAddress,
} from '../../../../src/lib/services/address-policy';
import { webFetch } from '../../../../src/lib/services/engine';

const headers = (map: Record<string, string> = {}) => ({
	get: (name: string) => map[name.toLowerCase()] ?? null,
});

const answering =
	(status: number, map: Record<string, string> = {}): IFetchLike =>
	async () => ({
		ok: status < 400,
		status,
		headers: headers(map),
		text: async () => 'body',
	});

describe('isPrivateAddress', () => {
	it.each([
		'127.0.0.1',
		'10.1.2.3',
		'172.16.0.1',
		'192.168.1.1',
		'169.254.169.254',
		'100.64.0.1',
		'0.0.0.0',
		'::1',
		'fd00::1',
		'fe80::1',
		'::ffff:127.0.0.1',
	])('%s is private', (address) => {
		expect(isPrivateAddress(address)).toBe(true);
	});

	it.each(['93.184.216.34', '2606:2800:220:1::1', '::ffff:8.8.8.8'])(
		'%s is public',
		(address) => {
			expect(isPrivateAddress(address)).toBe(false);
		},
	);
});

describe('refusedAddress', () => {
	it('lets the allow-list opt in by naming the address or localhost', () => {
		expect(
			refusedAddress('127.0.0.1', ['127.0.0.1'], false),
		).toBeUndefined();
		expect(
			refusedAddress('localhost', ['127.0.0.1'], false),
		).toBeUndefined();
		expect(refusedAddress('a.example', ['10.0.0.1'], true)).toBeUndefined();
	});
});

describe('webFetch over a resolver', () => {
	it('refuses an allow-listed name that resolves to loopback (DNS rebinding)', async () => {
		let fetched = false;
		const result = await webFetch(
			{ url: 'https://example.com/x', allowList: ['example.com'] },
			async (...args) => {
				fetched = true;
				return answering(200)(...args);
			},
			async () => ['93.184.216.34', '127.0.0.1'],
		);
		expect(result).toMatchObject({
			ok: false,
			reason: 'blocked-address',
			detail: 'example.com resolves to 127.0.0.1',
		});
		expect(fetched).toBe(false);
	});

	it('fetches a name that resolves only to public addresses', async () => {
		const result = await webFetch(
			{ url: 'https://example.com/x', allowList: ['example.com'] },
			answering(200),
			async () => ['93.184.216.34'],
		);
		expect(result.ok).toBe(true);
	});

	it('returns a typed error for a Location that is not a URL', async () => {
		const result = await webFetch(
			{ url: 'https://example.com/x', allowList: ['example.com'] },
			answering(302, { location: 'http://[bad' }),
		);
		expect(result).toMatchObject({ ok: false, reason: 'redirect-invalid' });
	});
});
