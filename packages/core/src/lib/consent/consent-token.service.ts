/**
 * consent-token.service.ts — tokens the server issues and verifies for one
 * exact action.
 *
 * A boolean or a token the caller invents proves nothing. These are an HMAC
 * of the action's digest under a secret that lives only in this process, so
 * nobody outside it can make one, one action's token does not fit another,
 * and none survive a restart.
 */
import {
	createHash,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from 'node:crypto';

import type { IConsentSigner } from '../contracts/interfaces/consent-signer.interface';

/** A stable digest of what an action would do. */
export const consentDigest = (action: unknown): string =>
	createHash('sha256').update(JSON.stringify(action)).digest('hex');

export const createConsentSigner = (
	secret: Buffer = randomBytes(32),
	prefix = 'ctk_',
): IConsentSigner => {
	const issue = (actionDigest: string): string =>
		`${prefix}${createHmac('sha256', secret).update(actionDigest).digest('hex')}`;
	return {
		issue,
		verify: (token, actionDigest) => {
			const expected = Buffer.from(issue(actionDigest));
			const given = Buffer.from(token);
			return (
				given.length === expected.length &&
				timingSafeEqual(given, expected)
			);
		},
	};
};
