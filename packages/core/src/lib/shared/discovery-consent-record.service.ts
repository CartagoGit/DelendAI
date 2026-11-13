/**
 * discovery-consent-record.service.ts — the user's answer to the discovery
 * question, read and written in one place.
 *
 * The runner asks through the host (MCP elicitation) and the CLI asks in a
 * terminal; a host that never shows the question leaves the CLI as the only
 * way to answer, so both keep the same record.
 */
import { basename, dirname, join } from 'node:path';

import {
	DISCOVERY_CONSENT_FILE,
	DISCOVERY_CONSENT_OWNER,
	DISCOVERY_CONSENT_QUESTION,
	DISCOVERY_CONSENT_SCHEMA,
} from '../contracts/constants/discovery-consent.constant';
import type { IDiscoveryConsentAnswer } from '../contracts/interfaces/discovery-consent-answer.interface';
import { writeFileAtomic } from './atomic-write';
import { SafeWorkspaceReader } from '../filesystem/safe-workspace-reader';
import { withFileMutex } from './with-file-mutex';

/** The record under `<cacheDir>/orchestrator-runner/`. */
export const discoveryConsentPath = (
	workspaceRoot: string,
	cacheDir: string,
): string =>
	join(
		workspaceRoot,
		cacheDir,
		DISCOVERY_CONSENT_OWNER,
		DISCOVERY_CONSENT_FILE,
	);

/** The recorded answer; a missing or foreign file is no answer. */
export const readDiscoveryConsent = async (
	path: string,
): Promise<IDiscoveryConsentAnswer | undefined> => {
	try {
		const reader = new SafeWorkspaceReader(dirname(path));
		if ((await reader.exists(basename(path))) === null) return undefined;
		const parsed: unknown = JSON.parse(
			(await reader.readText(basename(path))).content,
		);
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			(parsed as { schema?: unknown }).schema !== DISCOVERY_CONSENT_SCHEMA
		)
			return undefined;
		// A record from before answers were kept both ways holds only a grant.
		return (parsed as { answer?: unknown }).answer === 'declined'
			? 'declined'
			: 'granted';
	} catch {
		return undefined;
	}
};

export const recordDiscoveryConsent = async (
	path: string,
	answer: IDiscoveryConsentAnswer,
	now: Date,
): Promise<void> => {
	const record = {
		schema: DISCOVERY_CONSENT_SCHEMA,
		answer,
		answeredAt: now.toISOString(),
		question: DISCOVERY_CONSENT_QUESTION,
	};
	await withFileMutex(path, async () => {
		await writeFileAtomic(path, `${JSON.stringify(record, null, '\t')}\n`);
	});
};
