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
import { withFileMutex, writeFileAtomic } from '@delendai/core/runtime';

import { DISCOVERY_CONSENT_QUESTION } from '../contracts/constants/discovery-consent.constant';
import { readCacheFile } from './read-cache-file.helper';
import type {
	IConsentAsk,
	IDiscoveryMode,
	IDiscoveryConsent,
} from '../contracts/interfaces/discovery-consent.interface';

const DISCOVERY_CONSENT_SCHEMA =
	'delendai/orchestrator-runner/discovery-consent/1' as const;

const MANUAL_NEXT =
	'Onboard by questions: ask the user which AI clients they use, one account per sign-in, the isolated profile directory of each, its plan (subscription, token plan, own API key, local) and whether unattended work may use it; then propose the `accounts` and `providers` entries for delendai.config.json.';

const recordedGrant = async (consentPath: string): Promise<boolean> => {
	try {
		const raw = await readCacheFile(consentPath);
		if (raw === undefined) return false;
		const parsed: unknown = JSON.parse(raw);
		return (
			typeof parsed === 'object' &&
			parsed !== null &&
			(parsed as { schema?: unknown }).schema === DISCOVERY_CONSENT_SCHEMA
		);
	} catch {
		return false;
	}
};

const recordGrant = async (consentPath: string, now: Date): Promise<void> => {
	const record = {
		schema: DISCOVERY_CONSENT_SCHEMA,
		grantedAt: now.toISOString(),
		question: DISCOVERY_CONSENT_QUESTION,
	};
	await withFileMutex(consentPath, async () => {
		await writeFileAtomic(
			consentPath,
			`${JSON.stringify(record, null, '\t')}\n`,
		);
	});
};

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
	if (await recordedGrant(input.consentPath)) return { state: 'granted' };
	const answer = await input.ask(DISCOVERY_CONSENT_QUESTION);
	if (answer === 'accept') {
		await recordGrant(
			input.consentPath,
			(input.now ?? (() => new Date()))(),
		);
		return { state: 'granted' };
	}
	if (answer === 'decline')
		return {
			state: 'declined',
			next: `The user declined discovery. ${MANUAL_NEXT}`,
		};
	return {
		state: 'unavailable',
		next: `This host cannot ask the user (no MCP elicitation), so nothing was probed. ${MANUAL_NEXT}`,
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
