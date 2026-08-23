import { describe, expect, it } from 'vitest';

import {
	ConfirmationSigner,
	denyAllConfirmationGate,
} from '../../../../src/lib/invoke/token';

const hop = (
	overrides: Partial<{
		invocationId: string;
		providerId: string;
		estimatedCostTier: number;
	}> = {},
) => ({
	invocationId: 'inv-1',
	providerId: 'claude-code',
	estimatedCostTier: 3,
	...overrides,
});

describe('ConfirmationSigner (CRITICAL I5)', () => {
	it('mints a token that authorises exactly its spend hop', () => {
		const signer = new ConfirmationSigner();
		const token = signer.mint(hop());
		expect(token.startsWith('otk_')).toBe(true);
		expect(signer.verify(token, hop())).toBe(true);
	});

	it('rejects a token replayed against a DIFFERENT invocation id', () => {
		const signer = new ConfirmationSigner();
		const token = signer.mint(hop());
		expect(signer.verify(token, hop({ invocationId: 'inv-2' }))).toBe(
			false,
		);
	});

	it('rejects a token replayed against a DIFFERENT provider (a00085 #5)', () => {
		const signer = new ConfirmationSigner();
		const token = signer.mint(hop({ providerId: 'cheap-cli' }));
		expect(signer.verify(token, hop({ providerId: 'pricey-api' }))).toBe(
			false,
		);
	});

	it('rejects a token replayed against a DIFFERENT cost tier (a00085 #5)', () => {
		const signer = new ConfirmationSigner();
		const token = signer.mint(hop({ estimatedCostTier: 1 }));
		expect(signer.verify(token, hop({ estimatedCostTier: 5 }))).toBe(false);
	});

	it('rejects a tampered or wrong-length token (no throw)', () => {
		const signer = new ConfirmationSigner();
		const token = signer.mint(hop());
		expect(signer.verify(`${token}x`, hop())).toBe(false);
		expect(signer.verify('otk_deadbeef', hop())).toBe(false);
		expect(signer.verify('', hop())).toBe(false);
	});

	it('a token from one signer never verifies under another (secret is per-process)', () => {
		const a = new ConfirmationSigner();
		const b = new ConfirmationSigner();
		const token = a.mint(hop());
		// Overwhelmingly likely with fresh 32-byte secrets; deterministic here
		// because the two secrets differ.
		expect(b.verify(token, hop())).toBe(false);
	});

	it('is deterministic for a fixed secret + hop (mint is a pure HMAC)', () => {
		const secret = Buffer.alloc(32, 7);
		const s1 = new ConfirmationSigner(secret);
		const s2 = new ConfirmationSigner(secret);
		expect(s1.mint(hop({ invocationId: 'inv-9' }))).toBe(
			s2.mint(hop({ invocationId: 'inv-9' })),
		);
	});
});

describe('denyAllConfirmationGate (safe default)', () => {
	it('DENIES every spend by returning null (no host elicitation = no spend)', async () => {
		const result = await denyAllConfirmationGate.confirm({
			invocationId: 'inv-1',
			providerId: 'claude-code',
			estimatedCostTier: 3,
		});
		expect(result).toBeNull();
	});
});
