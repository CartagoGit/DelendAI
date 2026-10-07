import { describe, expect, it } from 'vitest';

import {
	DEFAULT_MODEL_PROFILES,
	detectModelTier,
	filterToolsByProfile,
	getModelProfile,
	listModelProfiles,
} from '../../../../src/lib/presets/model-profiles';
import type { IModelProfile } from '../../../../src/lib/presets/model-profiles';

describe('DEFAULT_MODEL_PROFILES (f00196)', () => {
	it('declares small / medium / large with the documented numbers', () => {
		expect(DEFAULT_MODEL_PROFILES.small.maxInitialToolTokens).toBe(4_000);
		expect(DEFAULT_MODEL_PROFILES.medium.maxInitialToolTokens).toBe(8_000);
		expect(DEFAULT_MODEL_PROFILES.large.maxInitialToolTokens).toBe(16_000);
	});

	it('keeps every tier self-consistent (bytes >= tokens × 4)', () => {
		for (const profile of Object.values(DEFAULT_MODEL_PROFILES)) {
			expect(profile.maxToolSurfaceBytes).toBeGreaterThanOrEqual(
				profile.maxInitialToolTokens * 4,
			);
		}
	});

	it('ranks tiers by budget (small < medium < large)', () => {
		const s = DEFAULT_MODEL_PROFILES.small.maxInitialToolTokens;
		const m = DEFAULT_MODEL_PROFILES.medium.maxInitialToolTokens;
		const l = DEFAULT_MODEL_PROFILES.large.maxInitialToolTokens;
		expect(s).toBeLessThan(m);
		expect(m).toBeLessThan(l);
	});

	it('weights are validated per tier', () => {
		// Every weight is non-negative and the per-tier sum <= 1 (sanity).
		for (const profile of Object.values(DEFAULT_MODEL_PROFILES)) {
			expect(profile.routing.lambda).toBeGreaterThanOrEqual(0);
			expect(profile.routing.mu).toBeGreaterThanOrEqual(0);
			expect(profile.routing.nu).toBeGreaterThanOrEqual(0);
			expect(
				profile.routing.lambda +
					profile.routing.mu +
					profile.routing.nu,
			).toBeLessThanOrEqual(1 + 1e-9);
		}
	});
});

describe('getModelProfile() (f00196)', () => {
	it('returns the small profile for "small"', () => {
		expect(getModelProfile('small').id).toBe('small');
	});

	it('falls back to medium for unknown ids (host-agnostic)', () => {
		const p = getModelProfile('gpt-9000-ultra');
		expect(p.id).toBe('medium');
	});

	it('host overrides win on numeric fields', () => {
		const p = getModelProfile('small', {
			small: { maxInitialToolTokens: 1_234 },
		});
		expect(p.maxInitialToolTokens).toBe(1_234);
		expect(p.maxToolSurfaceBytes).toBe(
			DEFAULT_MODEL_PROFILES.small.maxToolSurfaceBytes,
		);
	});

	it('host routing overrides deep-merge with defaults', () => {
		const p = getModelProfile('medium', {
			medium: { routing: { lambda: 0.99 } },
		});
		expect(p.routing.lambda).toBe(0.99);
		expect(p.routing.mu).toBe(DEFAULT_MODEL_PROFILES.medium.routing.mu);
		expect(p.routing.nu).toBe(DEFAULT_MODEL_PROFILES.medium.routing.nu);
	});
});

describe('listModelProfiles() (f00196)', () => {
	it('returns the three default tiers in declaration order', () => {
		const list = listModelProfiles();
		expect(list.map((p) => p.id)).toEqual(['small', 'medium', 'large']);
	});

	it('appends unknown host tiers after the defaults', () => {
		const list = listModelProfiles({
			custom: { id: 'custom', maxInitialToolTokens: 12_345 },
		});
		expect(list.map((p) => p.id)).toEqual([
			'small',
			'medium',
			'large',
			'custom',
		]);
	});
});

describe('detectModelTier() (f00196)', () => {
	it('maps "small" / "nano" / "mini" → small', () => {
		expect(detectModelTier('small')).toBe('small');
		expect(detectModelTier('nano')).toBe('small');
		expect(detectModelTier('mini')).toBe('small');
	});

	it('maps "large" / "xl" / "opus" → large', () => {
		expect(detectModelTier('large')).toBe('large');
		expect(detectModelTier('xl')).toBe('large');
		expect(detectModelTier('opus')).toBe('large');
	});

	it('defaults to medium for null / empty / unknown', () => {
		expect(detectModelTier(null)).toBe('medium');
		expect(detectModelTier(undefined)).toBe('medium');
		expect(detectModelTier('')).toBe('medium');
		expect(detectModelTier('gpt-9000-ultra')).toBe('medium');
	});

	it('is case-insensitive', () => {
		expect(detectModelTier('SMALL')).toBe('small');
		expect(detectModelTier('  Large ')).toBe('large');
	});
});

describe('filterToolsByProfile() (f00196)', () => {
	interface ITool {
		readonly name: string;
		readonly staticBytes?: number;
	}

	it('drops tools that would push the budget over the profile max', () => {
		const tools: ITool[] = [
			{ name: 'a', staticBytes: 4_000 },
			{ name: 'b', staticBytes: 4_000 },
			{ name: 'c', staticBytes: 9_000 }, // small: 16_000; 4+4=8, +9=17 > 16, drop.
			{ name: 'd', staticBytes: 4_000 }, // 8+4=12, fits.
			{ name: 'e', staticBytes: 8_000 }, // 12+8=20 > 16, drop.
		];
		const out = filterToolsByProfile(tools, DEFAULT_MODEL_PROFILES.small);
		expect(out.map((t) => t.name)).toEqual(['a', 'b', 'd']);
	});

	it('a large profile keeps all of the tools in the sample set', () => {
		const tools: ITool[] = [
			{ name: 'a', staticBytes: 12_000 },
			{ name: 'b', staticBytes: 12_000 },
			{ name: 'c', staticBytes: 12_000 },
		];
		const out = filterToolsByProfile(tools, DEFAULT_MODEL_PROFILES.large);
		expect(out).toHaveLength(3);
	});

	it('treats missing staticBytes as 0 (never blocks)', () => {
		const tools: ITool[] = [{ name: 'a' }, { name: 'b', staticBytes: 1 }];
		const out = filterToolsByProfile(tools, DEFAULT_MODEL_PROFILES.small);
		expect(out.map((t) => t.name)).toEqual(['a', 'b']);
	});

	it('is deterministic — same input + same order → same output', () => {
		const tools: ITool[] = [
			{ name: 'a', staticBytes: 100 },
			{ name: 'b', staticBytes: 100 },
			{ name: 'c', staticBytes: 100 },
		];
		const profile: IModelProfile = {
			...DEFAULT_MODEL_PROFILES.small,
			maxToolSurfaceBytes: 250,
		};
		const a = filterToolsByProfile(tools, profile).map((t) => t.name);
		const b = filterToolsByProfile(tools, profile).map((t) => t.name);
		expect(a).toEqual(b);
	});
});
