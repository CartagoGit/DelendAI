/**
 * REQUIREMENTS_NOT_CONSOLIDATED (f00156 S4).
 *
 * Pure over round-context timestamps/hashes. Never reads host transcripts.
 */
import type { ICheckpointAdvisory } from '@delendai/core/public';

export const REQUIREMENTS_CODE = 'REQUIREMENTS_NOT_CONSOLIDATED';

export interface IRequirementsDriftInput {
	readonly proposalId?: string;
	readonly checkpointUpdatedAt?: string | null;
	readonly chatContextLastUpdated?: string | null;
	readonly materialHashes?: Readonly<Record<string, string>>;
	readonly checkpointHashes?: Readonly<Record<string, string>>;
}

const parseTs = (value: string | null | undefined): number | null => {
	if (value === undefined || value === null || value.length === 0)
		return null;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
};

const driftedFields = (
	current: Readonly<Record<string, string>> | undefined,
	checkpoint: Readonly<Record<string, string>> | undefined,
): readonly string[] => {
	if (current === undefined) return [];
	const keys = Object.keys(current);
	if (checkpoint === undefined) return keys;
	return keys.filter((key) => current[key] !== checkpoint[key]);
};

export const assessRequirementsDrift = (
	input: IRequirementsDriftInput,
): ICheckpointAdvisory | null => {
	const checkpointMs = parseTs(input.checkpointUpdatedAt);
	const chatMs = parseTs(input.chatContextLastUpdated);
	const hashDrift = driftedFields(
		input.materialHashes,
		input.checkpointHashes,
	);
	const chatNewer =
		checkpointMs !== null && chatMs !== null && chatMs > checkpointMs;
	if (!chatNewer && hashDrift.length === 0) return null;

	const substantial =
		hashDrift.length >= 2 || (chatNewer && hashDrift.length >= 1);
	const proposalId = input.proposalId ?? 'unknown';
	const checkpointHash =
		input.checkpointUpdatedAt ??
		Object.values(input.checkpointHashes ?? {}).join(',') ??
		'none';
	return {
		triggered: true,
		code: REQUIREMENTS_CODE,
		severity: substantial ? 'strong' : 'recommend',
		message:
			'At this point, I recommend consolidating the new requirements into the active proposal and checkpoint before continuing implementation.',
		reason: 'the working scope has changed since the last semantic checkpoint',
		nextAction: 'consolidate-requirements',
		dedupeKey: `REQUIREMENTS_DRIFT:${proposalId}:${checkpointHash}`,
	};
};
