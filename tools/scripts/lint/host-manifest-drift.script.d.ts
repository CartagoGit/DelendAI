#!/usr/bin/env bun
import type {
	IHostCapabilityManifest,
	IHostCapabilityProjection,
} from '@delendai/contracts';
export type IHostManifestDriftField =
	| 'hostId'
	| 'mcp.tools'
	| 'mcp.prompts'
	| 'mcp.resources'
	| 'mcp.structuredContent'
	| 'mcp.listChanged'
	| 'mcp.notifications'
	| 'skills'
	| 'subagents';
export interface IHostManifestDrift {
	readonly hostId: string;
	readonly field: IHostManifestDriftField;
	readonly manifestValue: string | boolean | undefined;
	readonly projectionValue: string | boolean | undefined;
}
/** Compare one adapter projection with its canonical host manifest. */
export declare const findHostManifestDrift: (
	manifest: IHostCapabilityManifest,
	projection: IHostCapabilityProjection,
) => readonly IHostManifestDrift[];
/** Compare matching manifests and projections, reporting missing entries too. */
export declare const lintHostManifestDrift: (
	manifests: readonly IHostCapabilityManifest[],
	projections: readonly IHostCapabilityProjection[],
) => readonly IHostManifestDrift[];
