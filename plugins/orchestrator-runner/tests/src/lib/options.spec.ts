/**
 * options.spec.ts
 *
 * x00183 (F7): `subscription.tool` used to be a closed union of 4
 * runtime-known hosts (`vscode-copilot`, `claude-code`, `codex`,
 * `cursor`) baked into `@delendai/core`'s provider-capabilities
 * contract — adding a 5th host meant editing core. The field now
 * accepts any non-empty string; orchestrator-runner (not core) owns
 * deciding which hosts it actually knows how to drive.
 */
import { describe, expect, it } from 'vitest';

import { ProviderSchema } from '../../../src/lib/options';

const baseProvider = {
	id: 'a-new-host',
	kind: 'subscription' as const,
	modelId: 'some-model',
	contextWindow: 128_000,
	costTier: 1 as const,
	strengths: [] as const,
	weaknesses: [] as const,
};

describe('ProviderSchema — subscription.tool (x00183 F7)', () => {
	it('accepts a runtime-known host', () => {
		const result = ProviderSchema.safeParse({
			...baseProvider,
			invoke: { kind: 'subscription', tool: 'claude-code' },
		});
		expect(result.success).toBe(true);
	});

	it('accepts a brand-new host id core has never heard of', () => {
		const result = ProviderSchema.safeParse({
			...baseProvider,
			invoke: { kind: 'subscription', tool: 'some-future-ide' },
		});
		expect(result.success).toBe(true);
	});

	it('still rejects an empty tool id', () => {
		const result = ProviderSchema.safeParse({
			...baseProvider,
			invoke: { kind: 'subscription', tool: '' },
		});
		expect(result.success).toBe(false);
	});
});
