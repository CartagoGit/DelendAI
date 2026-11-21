// metadata-drift-detector: "did the project's meta-tooling change?".
//
// SOLID — Single Responsibility. This file owns the diff for the
// two "metadata" arrays of `IProjectAnalysis`: `ci` (detected CI
// systems) and `agentConfigs` (agent instruction files).
//
// SOLID — Open/Closed. A new metadata field (e.g. `dockerfiles`)
// is one entry in the `METADATA_FIELDS` table — the composer
// doesn't change.

import type { IDriftChange } from './drift';
import type { IDriftDetector, IDriftDetectorContext } from './drift-detector';
import { formatSetDiff, sameStrings } from './drift-detector';
import type { IProjectAnalysis } from './analyze-project';

type IDriftKind = 'ci-changed' | 'agent-config-changed';

interface IMetadataField {
	readonly key: keyof IProjectAnalysis;
	readonly label: string;
	readonly classify: () => IDriftKind;
}

const METADATA_FIELDS: readonly IMetadataField[] = [
	{
		key: 'ci',
		label: 'CI',
		classify: () => 'ci-changed',
	},
	{
		key: 'agentConfigs',
		label: 'agent configs',
		classify: () => 'agent-config-changed',
	},
];

export class MetadataDriftDetector implements IDriftDetector {
	readonly id = 'metadata';

	detect(ctx: IDriftDetectorContext): readonly IDriftChange[] {
		const out: IDriftChange[] = [];
		for (const field of METADATA_FIELDS) {
			const before = ctx.last[field.key] as readonly string[];
			const after = ctx.current[field.key] as readonly string[];
			if (sameStrings(before, after)) continue;
			out.push({
				kind: field.classify(),
				summary: `${field.label}: ${formatSetDiff(before, after)}`,
			});
		}
		return out;
	}
}
