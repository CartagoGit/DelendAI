import { describe, expect, it } from 'vitest';

import {
	buildStableManifest,
	SCHEMA_VERSION,
	STABLE_MANIFEST_REL,
} from '@mcp-vertex/core/lib/api/stable-manifest';
import {
	STABLE_API_TOOLS,
	STABLE_API_TOOL_NAMES,
	describeStableTool,
	findStableDescriptor,
} from '@mcp-vertex/core/lib/api/stable-facade';

describe('stable-facade (f00152 S2)', () => {
	it('exports nine facade tools (proposals surface)', () => {
		expect(STABLE_API_TOOL_NAMES).toEqual([
			'proposal_transition',
			'proposal_create',
			'auto_work',
			'agent_lock',
			'agent_worktree',
			'proposal_review',
			'task_queue_enqueue',
			'state_repair',
			'proposal_force_transition',
		]);
	});

	it('every descriptor is frozen (immutable after declaration)', () => {
		for (const descriptor of STABLE_API_TOOLS) {
			expect(Object.isFrozen(descriptor)).toBe(true);
		}
	});

	it('every descriptor has sinceVersion === current SCHEMA_VERSION', () => {
		for (const descriptor of STABLE_API_TOOLS) {
			expect(descriptor.sinceVersion).toBe(SCHEMA_VERSION);
		}
	});

	it('every descriptor carries the additive-only semver guarantee', () => {
		for (const descriptor of STABLE_API_TOOLS) {
			expect(descriptor.semverGuarantee).toBe('additive-only');
		}
	});

	it('findStableDescriptor returns null for unknown names', () => {
		expect(findStableDescriptor('not_in_facade')).toBeNull();
	});

	it('findStableDescriptor returns the descriptor for a known name', () => {
		const descriptor = findStableDescriptor('auto_work');
		expect(descriptor).not.toBeNull();
		expect(descriptor?.plugin).toBe('proposals');
	});

	it('describeStableTool returns a frozen object', () => {
		const descriptor = describeStableTool({
			name: 'test_tool',
			plugin: 'test',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: undefined as never,
			outputSchema: undefined as never,
			summary: 'test',
		});
		expect(Object.isFrozen(descriptor)).toBe(true);
		expect(descriptor.name).toBe('test_tool');
	});
});

describe('stable-manifest (f00152 S2)', () => {
	it('buildStableManifest produces a sorted, deterministic tool list', () => {
		const manifest = buildStableManifest(STABLE_API_TOOLS, '0.1.0', '2026-07-26T00:00:00.000Z');
		expect(manifest.version.schema).toBe(SCHEMA_VERSION);
		expect(manifest.version.packageVersion).toBe('0.1.0');
		expect(manifest.version.generatedAt).toBe('2026-07-26T00:00:00.000Z');
		expect(manifest.tools).toHaveLength(STABLE_API_TOOLS.length);
		// Sorted by name for byte-stable output.
		const names = manifest.tools.map((tool) => tool.name);
		expect(names).toEqual([...names].sort());
	});

	it('buildStableManifest tolerates unbound schemas (returns null)', () => {
		const manifest = buildStableManifest(STABLE_API_TOOLS, '0.1.0');
		// Today the facade ships unbound (zod schemas are bound at
		// runtime). The builder must not crash.
		for (const tool of manifest.tools) {
			expect(tool.inputSchema).toBeNull();
			expect(tool.outputSchema).toBeNull();
		}
	});

	it('STABLE_MANIFEST_REL is the canonical committed path', () => {
		expect(STABLE_MANIFEST_REL).toBe('docs/mcp-vertex/api/stable.json');
	});
});