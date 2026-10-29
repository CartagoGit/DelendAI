/**
 * provider-account-modes.constant.ts — the two axes an account declares
 * besides its transport: who supplies the credential, and how its use is
 * paid for. They are independent: a key the user brings (`byok-api-key`)
 * says who holds it, not which transport carries the call. `host-held`:
 * the key is the person's, but an editor keeps it (Copilot BYOK) and runs
 * the model when asked; delendai never sees it.
 */
export const CREDENTIAL_MODES = [
	'official-subscription-login',
	'provider-plan-token',
	'byok-api-key',
	'host-held',
	'local-none',
] as const;

export const BILLING_MODES = [
	'subscription-included',
	'prepaid-token-plan',
	'pay-as-you-go',
	'local',
] as const;
