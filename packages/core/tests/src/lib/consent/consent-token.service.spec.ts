/**
 * consent-token.service.spec.ts — a token fits the one action it was issued
 * for, under the one secret that issued it.
 */
import { describe, expect, it } from 'vitest';

import {
	consentDigest,
	createConsentSigner,
} from '@delendai/core/lib/consent/consent-token.service';

describe('createConsentSigner', () => {
	it('verifies its own token for that action, and no other', () => {
		const signer = createConsentSigner();
		const digest = consentDigest({ file: 'a.ts', hunks: [1] });
		const token = signer.issue(digest);
		expect(signer.verify(token, digest)).toBe(true);
		expect(signer.verify(token, consentDigest({ file: 'b.ts' }))).toBe(
			false,
		);
	});

	it('refuses an invented token and another process token', () => {
		const signer = createConsentSigner();
		const digest = consentDigest('x');
		expect(signer.verify('user-confirmed', digest)).toBe(false);
		expect(signer.verify(createConsentSigner().issue(digest), digest)).toBe(
			false,
		);
	});

	it('keeps a token format and a fixed secret when it is given them', () => {
		const signer = createConsentSigner(Buffer.alloc(32, 1), 'otk_');
		expect(signer.issue('d')).toMatch(/^otk_[0-9a-f]{64}$/u);
		expect(signer.issue('d')).toBe(
			createConsentSigner(Buffer.alloc(32, 1), 'otk_').issue('d'),
		);
	});
});
