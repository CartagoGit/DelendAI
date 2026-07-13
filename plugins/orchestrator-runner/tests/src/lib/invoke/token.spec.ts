import { describe, expect, it } from 'vitest';

import {
	ConfirmationSigner,
	denyAllConfirmationGate,
} from '../../../../src/lib/invoke/token';

describe('ConfirmationSigner (CRITICAL I5)', () => {
	it('mints a token that authorises exactly its invocation id', () => {
		const signer = new ConfirmationSigner();
		const token = signer.mint('inv-1');
		expect(token.startsWith('otk_')).toBe(true);
		expect(signer.verify(token, 'inv-1')).toBe(true);
	});

	it('rejects a token replayed against a DIFFERENT invocation id', () => {
		const signer = new ConfirmationSigner();
		const token = signer.mint('inv-1');
		expect(signer.verify(token, 'inv-2')).toBe(false);
	});

	it('rejects a tampered or wrong-length token (no throw)', () => {
		const signer = new ConfirmationSigner();
		const token = signer.mint('inv-1');
		expect(signer.verify(`${token}x`, 'inv-1')).toBe(false);
		expect(signer.verify('otk_deadbeef', 'inv-1')).toBe(false);
		expect(signer.verify('', 'inv-1')).toBe(false);
	});

	it('a token from one signer never verifies under another (secret is per-process)', () => {
		const a = new ConfirmationSigner();
		const b = new ConfirmationSigner();
		const token = a.mint('inv-1');
		// Overwhelmingly likely with fresh 32-byte secrets; deterministic here
		// because the two secrets differ.
		expect(b.verify(token, 'inv-1')).toBe(false);
	});

	it('is deterministic for a fixed secret + id (mint is a pure HMAC)', () => {
		const secret = Buffer.alloc(32, 7);
		const s1 = new ConfirmationSigner(secret);
		const s2 = new ConfirmationSigner(secret);
		expect(s1.mint('inv-9')).toBe(s2.mint('inv-9'));
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
