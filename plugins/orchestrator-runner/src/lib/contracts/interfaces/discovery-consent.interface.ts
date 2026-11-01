/**
 * discovery-consent.interface.ts — whether the runner may look at which AI
 * clients this machine has, and what to do when it may not.
 */

/** How discovery runs: ask once, never probe (onboard by questions), or off. */
export type IDiscoveryMode = 'auto-with-consent' | 'manual' | 'off';

/** What the user said, or why nobody could be asked. */
export type IDiscoveryConsentState =
	| 'granted'
	| 'declined'
	| 'unavailable'
	| 'manual'
	| 'off';

export interface IDiscoveryConsent {
	readonly state: IDiscoveryConsentState;
	/** What the caller can do next when the probes did not run. */
	readonly next?: string;
}

/** Asks the user the consent question; `unavailable` when the host cannot. */
export type IConsentAsk = (
	question: string,
) => Promise<'accept' | 'decline' | 'unavailable'>;
