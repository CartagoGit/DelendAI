import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	buildStableManifest,
	SCHEMA_VERSION,
	STABLE_MANIFEST_REL,
} from '@delendai/core/lib/api/stable-manifest';
import {
	CORE_STABLE_API_TOOLS,
	STABLE_API_TOOLS,
	STABLE_API_TOOL_NAMES,
	clearStableToolDescriptorContributions,
	describeStableTool,
	findStableDescriptor,
	registerStableToolDescriptors,
	resetStableToolDescriptorRegistryForTests,
} from '@delendai/core/lib/api/stable-facade';
import { PROPOSALS_STABLE_TOOLS } from '@delendai/proposals/lib/api/proposals-stable-tools';
import { MCP_VERTEX_VERSION } from '@delendai/core/version';

describe('stable-facade (f00152 S2)', () => {
	beforeEach(() => {
		resetStableToolDescriptorRegistryForTests();
	});

	afterEach(() => {
		clearStableToolDescriptorContributions();
	});

	it('exports only core-owned stable tools before plugins contribute', () => {
		expect(STABLE_API_TOOLS).toEqual(CORE_STABLE_API_TOOLS);
		expect(STABLE_API_TOOL_NAMES).toEqual([]);
	});

	it('composes the historical proposals surface when the plugin contributes', () => {
		registerStableToolDescriptors('proposals', PROPOSALS_STABLE_TOOLS);
		expect(STABLE_API_TOOL_NAMES).toEqual([
			'proposal_transition',
			'proposals_close_plan',
			'proposal_create',
			'auto_work',
			'agent_lock',
			'agent_worktree',
			'proposal_review',
			'task_queue_enqueue',
			'state_repair',
			'proposal_force_transition',
		]);
		expect(STABLE_API_TOOLS).toHaveLength(10);
	});

	it('every descriptor is frozen (immutable after declaration)', () => {
		registerStableToolDescriptors('proposals', PROPOSALS_STABLE_TOOLS);
		for (const descriptor of STABLE_API_TOOLS) {
			expect(Object.isFrozen(descriptor)).toBe(true);
		}
	});

	it('every descriptor has sinceVersion === current package version', () => {
		registerStableToolDescriptors('proposals', PROPOSALS_STABLE_TOOLS);
		for (const descriptor of STABLE_API_TOOLS) {
			expect(descriptor.sinceVersion).toBe(MCP_VERTEX_VERSION);
		}
	});

	it('every descriptor carries the additive-only semver guarantee', () => {
		registerStableToolDescriptors('proposals', PROPOSALS_STABLE_TOOLS);
		for (const descriptor of STABLE_API_TOOLS) {
			expect(descriptor.semverGuarantee).toBe('additive-only');
		}
	});

	it('findStableDescriptor returns null for unknown names', () => {
		expect(findStableDescriptor('not_in_facade')).toBeNull();
	});

	it('findStableDescriptor returns the descriptor for a known name', () => {
		registerStableToolDescriptors('proposals', PROPOSALS_STABLE_TOOLS);
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
		registerStableToolDescriptors('proposals', PROPOSALS_STABLE_TOOLS);
		const manifest = buildStableManifest(
			STABLE_API_TOOLS,
			'0.1.0',
			'2026-07-26T00:00:00.000Z',
		);
		expect(manifest.version.schema).toBe(SCHEMA_VERSION);
		expect(manifest.version.packageVersion).toBe('0.1.0');
		expect(manifest.version.generatedAt).toBe('2026-07-26T00:00:00.000Z');
		expect(manifest.tools).toHaveLength(STABLE_API_TOOLS.length);
		// Sorted by name for byte-stable output.
		const names = manifest.tools.map((tool) => tool.name);
		expect(names).toEqual([...names].sort());
	});

	it('buildStableManifest publishes bound schemas', () => {
		registerStableToolDescriptors('proposals', PROPOSALS_STABLE_TOOLS);
		const manifest = buildStableManifest(STABLE_API_TOOLS, '0.1.0');
		for (const tool of manifest.tools) {
			expect(tool.inputSchema).toEqual(expect.any(Object));
			expect(tool.outputSchema).toEqual(expect.any(Object));
		}
	});

	it('STABLE_MANIFEST_REL is the canonical committed path', () => {
		expect(STABLE_MANIFEST_REL).toBe('docs/mcp-vertex/api/stable.json');
	});
});
