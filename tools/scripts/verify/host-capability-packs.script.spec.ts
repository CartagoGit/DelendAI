import { describe, expect, it, vi } from 'vitest';

import type { IHostAdapterPack } from '@mcp-vertex/core/public';

import {
	CANONICAL_PROFILES,
	runHostCapabilityGate,
} from './host-capability-packs.script';

const manualProfile = {
	id: 'manual-profile',
	capabilities: {
		mcp: { tools: true, prompts: false, resources: false },
		instructions: 'none',
		skills: 'none',
		lifecycle: 'none',
		continuation: 'manual',
	},
};

describe('runHostCapabilityGate', () => {
	it('passes on the canonical shipped profiles', () => {
		const result = runHostCapabilityGate(CANONICAL_PROFILES);
		expect(result.ok).toBe(true);
		expect(result.findings).toEqual([]);
		expect(result.profiles).toEqual([
			'generic-mcp',
			'codex',
			'claude-code',
			'host-loop-reference',
		]);
	});

	it('rejects an empty host id', () => {
		const result = runHostCapabilityGate([
			{
				id: '   ',
				capabilities: {
					mcp: { tools: true, prompts: false, resources: false },
					instructions: 'none',
					skills: 'none',
					lifecycle: 'none',
					continuation: 'manual',
				},
			},
		]);
		expect(result.ok).toBe(false);
		expect(result.findings.some((f) => f.ruleId === 'empty-host-id')).toBe(
			true,
		);
	});

	it('rejects a profile with no MCP surface', () => {
		const result = runHostCapabilityGate([
			{
				id: 'no-mcp',
				capabilities: {
					mcp: { tools: false, prompts: false, resources: false },
					instructions: 'none',
					skills: 'none',
					lifecycle: 'none',
					continuation: 'manual',
				},
			},
		]);
		expect(result.ok).toBe(false);
		expect(result.findings.some((f) => f.ruleId === 'no-mcp-surface')).toBe(
			true,
		);
	});

	it('flags a duplicate hostId', () => {
		const result = runHostCapabilityGate([manualProfile, manualProfile]);
		expect(result.ok).toBe(false);
		expect(
			result.findings.some((f) => f.ruleId === 'duplicate-host-id'),
		).toBe(true);
	});

	it('is pure (same input -> same output)', () => {
		const a = runHostCapabilityGate([manualProfile]);
		const b = runHostCapabilityGate([manualProfile]);
		expect(a.ok).toBe(b.ok);
		expect(a.findings).toEqual(b.findings);
	});
});

describe('validateOne negative branches via vi.mock', () => {
	const stubBuilder = (pack: IHostAdapterPack): void => {
		vi.doMock('@mcp-vertex/core/public', async () => {
			const actual = await vi.importActual<
				typeof import('@mcp-vertex/core/public')
			>('@mcp-vertex/core/public');
			return { ...actual, buildHostAdapterPack: () => pack };
		});
	};

	const runFresh = async () => {
		// Re-import so the mocked module is honoured.
		const mod = await import('./host-capability-packs.script?fresh');
		return mod.runHostCapabilityGate([manualProfile]);
	};

	afterEach(() => {
		vi.doUnmock('@mcp-vertex/core/public');
		vi.resetModules();
	});

	it('flags host-loop-without-runner', async () => {
		stubBuilder({
			version: 1,
			hostId: 'manual-profile',
			actions: [{ kind: 'connect-mcp', mode: 'tools', required: true }],
			continuation: {
				mode: 'host-loop',
				requiresHostRunner: false,
				fallback: 'handoff-and-new-turn',
			},
		});
		const result = await runFresh();
		expect(result.ok).toBe(false);
		expect(
			result.findings.some(
				(f) => f.ruleId === 'host-loop-without-runner',
			),
		).toBe(true);
	});

	it('flags runner-without-host-loop', async () => {
		stubBuilder({
			version: 1,
			hostId: 'manual-profile',
			actions: [{ kind: 'connect-mcp', mode: 'tools', required: true }],
			continuation: {
				mode: 'manual',
				requiresHostRunner: true,
				fallback: 'handoff-and-new-turn',
			},
		});
		const result = await runFresh();
		expect(result.ok).toBe(false);
		expect(
			result.findings.some(
				(f) => f.ruleId === 'runner-without-host-loop',
			),
		).toBe(true);
	});

	it('flags continuation-mode-mismatch', async () => {
		stubBuilder({
			version: 1,
			hostId: 'manual-profile',
			actions: [
				{ kind: 'connect-mcp', mode: 'tools', required: true },
				{ kind: 'continue-work', mode: 'host-loop', required: false },
			],
			continuation: {
				mode: 'manual',
				requiresHostRunner: false,
				fallback: 'handoff-and-new-turn',
			},
		});
		const result = await runFresh();
		expect(result.ok).toBe(false);
		expect(
			result.findings.some(
				(f) => f.ruleId === 'continuation-mode-mismatch',
			),
		).toBe(true);
	});

	it('flags bad-version', async () => {
		stubBuilder({
			version: 2 as 1,
			hostId: 'manual-profile',
			actions: [{ kind: 'connect-mcp', mode: 'tools', required: true }],
			continuation: {
				mode: 'manual',
				requiresHostRunner: false,
				fallback: 'handoff-and-new-turn',
			},
		});
		const result = await runFresh();
		expect(result.ok).toBe(false);
		expect(result.findings.some((f) => f.ruleId === 'bad-version')).toBe(
			true,
		);
	});

	it('flags unknown-action-kind', async () => {
		const offContract = {
			version: 1,
			hostId: 'manual-profile',
			actions: [
				{ kind: 'connect-mcp', mode: 'tools', required: true },
				{ kind: 'made-up', mode: 'tools', required: false },
			],
			continuation: {
				mode: 'manual',
				requiresHostRunner: false,
				fallback: 'handoff-and-new-turn',
			},
		} as unknown as IHostAdapterPack;
		stubBuilder(offContract);
		const result = await runFresh();
		expect(result.ok).toBe(false);
		expect(
			result.findings.some((f) => f.ruleId === 'unknown-action-kind'),
		).toBe(true);
	});

	it('flags missing-mcp-baseline', async () => {
		stubBuilder({
			version: 1,
			hostId: 'manual-profile',
			actions: [{ kind: 'connect-mcp', mode: 'tools', required: false }],
			continuation: {
				mode: 'manual',
				requiresHostRunner: false,
				fallback: 'handoff-and-new-turn',
			},
		});
		const result = await runFresh();
		expect(result.ok).toBe(false);
		expect(
			result.findings.some((f) => f.ruleId === 'missing-mcp-baseline'),
		).toBe(true);
	});
});

import { afterEach } from 'vitest';
