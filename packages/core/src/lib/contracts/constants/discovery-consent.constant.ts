/**
 * discovery-consent.constant.ts — the question put to the user before any
 * discovery probe runs on their machine, and where the answer is kept.
 */
export const DISCOVERY_CONSENT_QUESTION =
	'May DelendAI look only at which AI clients are installed on this machine — their names, versions and sign-in status as each client reports it? It reads no credentials and changes nothing.';

/** The record's schema: a file without it is no answer. */
export const DISCOVERY_CONSENT_SCHEMA =
	'delendai/orchestrator-runner/discovery-consent/1' as const;

/** The answer lives in the cache of the plugin that asks the question. */
export const DISCOVERY_CONSENT_OWNER = 'orchestrator-runner';

export const DISCOVERY_CONSENT_FILE = 'discovery-consent.json';

/** How to answer when the host cannot put the question. */
export const DISCOVERY_CONSENT_COMMAND = 'delendai accounts consent --yes|--no';
