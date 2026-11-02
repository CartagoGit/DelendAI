/** Issues and verifies tokens for an action's digest. */
export interface IConsentSigner {
	issue(actionDigest: string): string;
	verify(token: string, actionDigest: string): boolean;
}
