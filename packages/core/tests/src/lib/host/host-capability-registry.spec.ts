import { describe, expect, it } from 'vitest';

import {
	HostCapabilityRegistry,
	createHostCapabilityRegistry,
	type IHostCapabilityProjection,
} from '@mcp-vertex/core/lib/host/host-capability-registry';
import type { IHostCapabilityManifest } from '@mcp-vertex/contracts';
import {
	findHostManifestDrift,
	lintHostManifestDrift,
} from '../../../../../../tools/scripts/lint/host-manifest-drift.script';

const manifest = {
	contract: 'mcp-vertex.host-capability-manifest',
	version: 1,
	hostId: 'codex-cli',
	mcp: {
		tools: true,
		prompts: true,
		resources: false,
		structuredContent: true,
		listChanged: true,
		notifications: false,
	},
	skills: 'native',
	subagents: 'mcp-tool',
} satisfies IHostCapabilityManifest;

describe('HostCapabilityRegistry', () => {
	it('derives every supportsX view from the canonical manifest', () => {
		const registry = new HostCapabilityRegistry([manifest]);

		expect(registry.supportsTools('codex-cli')).toBe(true);
		expect(registry.supportsPrompts('codex-cli')).toBe(true);
		expect(registry.supportsResources('codex-cli')).toBe(false);
		expect(registry.supportsStructuredContent('codex-cli')).toBe(true);
		expect(registry.supportsListChanged('codex-cli')).toBe(true);
		expect(registry.supportsNotifications('codex-cli')).toBe(false);
		expect(registry.supportsSkills('codex-cli')).toBe(true);
		expect(registry.supportsSubagents('codex-cli')).toBe(true);
		expect(registry.supports('codex-cli', 'resources')).toBe(false);
		expect(registry.supportsPrompts('unknown-host')).toBe(false);
	});

	it('returns defensive, stable projections and manifest listings', () => {
		const registry = createHostCapabilityRegistry([
			{ ...manifest, hostId: 'z-host' },
			{
				...manifest,
				hostId: 'a-host',
				skills: 'none',
				subagents: 'none',
			},
		]);

		const projection = registry.project('a-host');
		expect(projection).toEqual({
			hostId: 'a-host',
			mcp: manifest.mcp,
			skills: 'none',
			subagents: 'none',
		});
		expect(registry.list().map((entry) => entry.hostId)).toEqual([
			'a-host',
			'z-host',
		]);
		const exposed = registry.get('a-host');
		expect(exposed).not.toBe(manifest);
		expect(exposed?.mcp).not.toBe(manifest.mcp);
		expect(registry.supportsPrompts('a-host')).toBe(true);
	});

	it('rejects malformed and duplicate manifests at the boundary', () => {
		expect(
			() =>
				new HostCapabilityRegistry([
					{ ...manifest, hostId: 'Not valid' },
				]),
		).toThrow('kebab-case');
		expect(() => new HostCapabilityRegistry([manifest, manifest])).toThrow(
			'duplicate',
		);
		expect(
			() =>
				new HostCapabilityRegistry([
					{ ...manifest, mcp: { ...manifest.mcp, tools: false } },
				]),
		).toThrow('MCP tools');
	});

	it('keeps the drift input structural and easy to compare', () => {
		const registry = new HostCapabilityRegistry([manifest]);
		const projection: IHostCapabilityProjection =
			registry.project('codex-cli')!;
		expect(projection.skills).toBe('native');
		expect(projection.mcp.structuredContent).toBe(true);
	});

	it('reports a projection that diverges from the manifest', () => {
		const registry = new HostCapabilityRegistry([manifest]);
		const projection = registry.project('codex-cli');
		expect(projection).toBeDefined();
		if (projection === undefined) return;

		const drift = findHostManifestDrift(manifest, {
			...projection,
			mcp: { ...projection.mcp, structuredContent: false },
		});
		expect(drift).toEqual([
			expect.objectContaining({
				field: 'mcp.structuredContent',
				manifestValue: true,
				projectionValue: false,
			}),
		]);
		expect(lintHostManifestDrift([manifest], [])).toEqual([
			expect.objectContaining({
				field: 'hostId',
				projectionValue: undefined,
			}),
		]);
		expect(
			lintHostManifestDrift([], [registry.project('codex-cli')!]),
		).toEqual([
			expect.objectContaining({
				field: 'hostId',
				manifestValue: undefined,
				projectionValue: 'codex-cli',
			}),
		]);
	});
});
