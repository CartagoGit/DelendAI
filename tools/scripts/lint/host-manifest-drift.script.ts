#!/usr/bin/env bun
/**
 * Guard the host-manifest boundary.
 *
 * Host adapters may keep a projection for their own integration API, but the
 * projection must agree with the canonical manifest. The comparison is pure
 * and exported for adapter-specific tests; the command-line entry point
 * accepts JSON fixtures so CI and downstream hosts can use the same guard.
 */
import { readFile } from 'node:fs/promises';

import type {
	IHostCapabilityManifest,
	IHostCapabilityProjection,
} from '@mcp-vertex/contracts';

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

const fields: readonly {
	readonly field: IHostManifestDriftField;
	readonly read: (
		value: IHostCapabilityManifest | IHostCapabilityProjection,
	) => string | boolean | undefined;
}[] = [
	{ field: 'hostId', read: (value) => value.hostId },
	{ field: 'mcp.tools', read: (value) => value.mcp.tools },
	{ field: 'mcp.prompts', read: (value) => value.mcp.prompts },
	{ field: 'mcp.resources', read: (value) => value.mcp.resources },
	{
		field: 'mcp.structuredContent',
		read: (value) => value.mcp.structuredContent,
	},
	{ field: 'mcp.listChanged', read: (value) => value.mcp.listChanged },
	{ field: 'mcp.notifications', read: (value) => value.mcp.notifications },
	{ field: 'skills', read: (value) => value.skills },
	{ field: 'subagents', read: (value) => value.subagents },
];

/** Compare one adapter projection with its canonical host manifest. */
export const findHostManifestDrift = (
	manifest: IHostCapabilityManifest,
	projection: IHostCapabilityProjection,
): readonly IHostManifestDrift[] => {
	const findings: IHostManifestDrift[] = [];
	for (const entry of fields) {
		const manifestValue = entry.read(manifest);
		const projectionValue = entry.read(projection);
		if (manifestValue === projectionValue) continue;
		findings.push({
			hostId: manifest.hostId,
			field: entry.field,
			manifestValue,
			projectionValue,
		});
	}
	return findings;
};

/** Compare matching manifests and projections, reporting missing entries too. */
export const lintHostManifestDrift = (
	manifests: readonly IHostCapabilityManifest[],
	projections: readonly IHostCapabilityProjection[],
): readonly IHostManifestDrift[] => {
	const byHost = new Map(
		projections.map((projection) => [projection.hostId, projection]),
	);
	const findings: IHostManifestDrift[] = [];
	for (const manifest of manifests) {
		const projection = byHost.get(manifest.hostId);
		if (projection === undefined) {
			findings.push({
				hostId: manifest.hostId,
				field: 'hostId',
				manifestValue: manifest.hostId,
				projectionValue: undefined,
			});
			continue;
		}
		findings.push(...findHostManifestDrift(manifest, projection));
	}
	const manifestHosts = new Set(manifests.map((manifest) => manifest.hostId));
	for (const projection of projections) {
		if (manifestHosts.has(projection.hostId)) continue;
		findings.push({
			hostId: projection.hostId,
			field: 'hostId',
			manifestValue: undefined,
			projectionValue: projection.hostId,
		});
	}
	return findings;
};

const parseJsonFile = async <T>(path: string): Promise<T> =>
	JSON.parse(await readFile(path, 'utf8')) as T;

const argumentValue = (name: string): string | undefined => {
	const prefix = `--${name}=`;
	return process.argv
		.find((argument) => argument.startsWith(prefix))
		?.slice(prefix.length);
};

const main = async (): Promise<number> => {
	const manifestPath = argumentValue('manifest');
	const projectionPath = argumentValue('projection');
	if (manifestPath === undefined || projectionPath === undefined) {
		console.log(
			'host-manifest-drift: no fixture paths supplied; exported guard is ready for host adapters.',
		);
		return 0;
	}
	const manifests =
		await parseJsonFile<readonly IHostCapabilityManifest[]>(manifestPath);
	const projections =
		await parseJsonFile<readonly IHostCapabilityProjection[]>(
			projectionPath,
		);
	const findings = lintHostManifestDrift(manifests, projections);
	if (findings.length === 0) {
		console.log(
			`host-manifest-drift: 0 drift(s) across ${manifests.length} host(s).`,
		);
		return 0;
	}
	for (const finding of findings) {
		console.error(
			`host-manifest-drift: ${finding.hostId} ${finding.field}: manifest=${JSON.stringify(finding.manifestValue)} projection=${JSON.stringify(finding.projectionValue)}`,
		);
	}
	return 1;
};

if (import.meta.main) process.exit(await main());
