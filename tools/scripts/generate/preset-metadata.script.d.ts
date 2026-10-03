#!/usr/bin/env bun
export declare const GENERATED_PRESET_METADATA_PATH =
	'packages/core/src/lib/contracts/constants/preset-metadata.generated.ts';
export declare const PRESET_METADATA_IDS: readonly [
	'minimal',
	'lean',
	'standard',
	'swarm',
	'full',
	'vertex',
	'web-app',
	'backend-api',
	'cli-tool',
];
export interface IGeneratedPresetEntry {
	readonly presetId: (typeof PRESET_METADATA_IDS)[number];
	readonly measurementSurface: 'native' | 'adaptive';
	readonly measuredAt: string;
	readonly toolCount: number;
	readonly schemaBytes: number;
	readonly estimatedTokens: number;
}
export declare const orderPresetMetadataEntries: (
	entries: readonly IGeneratedPresetEntry[],
) => readonly IGeneratedPresetEntry[];
/** Compare generated content without treating a measurement timestamp as
 * drift. The timestamp is provenance, not a metric, and must not force a
 * commit when the measured payload is unchanged. */
export declare const normalizeMeasuredAt: (text: string) => string;
export declare const buildPresetMetadataSource: (input?: {
	readonly measuredAt?: string;
	readonly entries?: readonly IGeneratedPresetEntry[];
}) => Promise<string>;
export declare const generatePresetMetadata: () => Promise<{
	readonly source: string;
	readonly outputPath: string;
}>;
