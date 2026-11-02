/**
 * discovery-consent.service.ts — no probe before the user says yes.
 *
 * Discovery runs CLIs on the user's machine (\`command -v\`, \`--version\`,
 * \`auth status\`). Under the default \`auto-with-consent\` mode the user is
 * asked once, through the host's MCP elicitation, and a yes is recorded so
 * they are not asked again; a no, or a host that cannot ask, leaves the
 * probes unrun and points at onboarding by questions. \`manual\` never
 * probes and \`off\` turns discovery away. Nothing an agent passes as an
 * argument stands in for the user's answer.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
	DISCOVERY_CONSENT_COMMAND,
	DISCOVERY_CONSENT_QUESTION,
} from '@delendai/core/contracts';
import {
	readDiscoveryConsent,
	recordDiscoveryConsent,
} from '@delendai/core/runtime';

import type {
	IConsentAsk,
	IDiscoveryMode,
	IDiscoveryConsent,
} from '../contracts/interfaces/discovery-consent.interface';

const MANUAL_NEXT =
	'Onboard by questions: ask the user which AI clients they use, one account per sign-in, the isolated profile directory of each, its plan (subscription, token plan, own API key, local) and whether unattended work may use it; then propose the `accounts` and `providers` entries for delendai.config.json.';

export const discoveryConsent = async (input: {
	readonly mode: IDiscoveryMode;
	readonly consentPath: string;
	readonly ask: IConsentAsk;
	readonly now?: () => Date;
}): Promise<IDiscoveryConsent> => {
	if (input.mode === 'off')
		return {
			state: 'off',
			next: 'Discovery is off in this project (`discovery: "off"`); declare `accounts` and `providers` in delendai.config.json by hand.',
		};
	if (input.mode === 'manual') return { state: 'manual', next: MANUAL_NEXT };
	const recorded = await readDiscoveryConsent(input.consentPath);
	if (recorded === 'granted') return { state: 'granted' };
	if (recorded === 'declined')
		return {
			state: 'declined',
			next: `The user declined discovery (\`${DISCOVERY_CONSENT_COMMAND}\` changes the answer). ${MANUAL_NEXT}`,
		};
	const answer = await input.ask(DISCOVERY_CONSENT_QUESTION);
	if (answer === 'accept') {
		await recordDiscoveryConsent(
			input.consentPath,
			'granted',
			(input.now ?? (() => new Date()))(),
		);
		return { state: 'granted' };
	}
	if (answer === 'decline')
		return {
			state: 'declined',
			// Some hosts decline without ever showing the question; the
			// person can still answer in a terminal.
			next: `The host answered no. If no question was shown, the person can answer with \`${DISCOVERY_CONSENT_COMMAND}\`. ${MANUAL_NEXT}`,
		};
	return {
		state: 'unavailable',
		next: `This host cannot ask the user (no MCP elicitation), so nothing was probed. The person can answer with \`${DISCOVERY_CONSENT_COMMAND}\`. ${MANUAL_NEXT}`,
	};
};

/** Asks through the host's MCP elicitation, when the client offers one. */
export const askThroughElicitation =
	(server: McpServer): IConsentAsk =>
	async (question) => {
		if (server.server.getClientCapabilities()?.elicitation === undefined)
			return 'unavailable';
		try {
			const result = await server.server.elicitInput({
				message: question,
				requestedSchema: { type: 'object', properties: {} },
			});
			return result.action === 'accept' ? 'accept' : 'decline';
		} catch {
			return 'unavailable';
		}
	};
