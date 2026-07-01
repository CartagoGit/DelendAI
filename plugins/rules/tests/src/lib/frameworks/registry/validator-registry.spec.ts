import { describe, it, expect } from 'vitest';

import { buildValidatorRegistry } from '@mcp-vertex/rules/lib/frameworks/registry/validator-registry';
import { RUST_PRESET } from '@mcp-vertex/rules/lib/frameworks/presets/data/rust';

import type { IRulePreset } from '@mcp-vertex/rules/lib/frameworks/contracts';

/**
 * Single Responsibility: the validator-registry wraps a
 * `readonly IPresetValidator[]` and exposes a single
 * `validate(preset)` method that composes the validators.
 * This spec pins:
 *   1. The default wiring (one validator by default).
 *   2. The OCP extension path (a test passes its own list).
 *   3. The composition order (validators run in registration
 *      order, findings accumulate).
 */
describe('IValidatorRegistry (S, OCP)', async () => {
	it('defaults to a single validator when no list is passed', async () => {
		const reg = buildValidatorRegistry();
		expect(reg.validators).toHaveLength(1);
		expect(reg.validate(RUST_PRESET)).toEqual([]);
	});

	it('accepts a custom list (OCP — append, never edit)', async () => {
		const longIdValidator = {
			validate(preset: IRulePreset) {
				if (preset.id.length > 20) {
					return [
						{
							code: 'linter-deps-mismatch' as const,
							message: `id too long: ${preset.id}`,
							presetId: preset.id,
						},
					];
				}
				return [];
			},
		};
		const reg = buildValidatorRegistry([longIdValidator]);
		expect(reg.validators).toHaveLength(1);
		// Empty list case: the registry still works.
		const empty = buildValidatorRegistry([]);
		expect(empty.validate(RUST_PRESET)).toEqual([]);
	});

	it('accumulates findings from multiple validators (composition order)', async () => {
		const v1 = {
			validate(preset: IRulePreset) {
				return [
					{
						code: 'empty-linter-config' as const,
						message: 'v1',
						presetId: preset.id,
					},
				];
			},
		};
		const v2 = {
			validate(preset: IRulePreset) {
				return [
					{
						code: 'empty-conventions' as const,
						message: 'v2',
						presetId: preset.id,
					},
				];
			},
		};
		const reg = buildValidatorRegistry([v1, v2]);
		const findings = reg.validate(RUST_PRESET);
		// Order is preserved: v1 first, v2 second.
		expect(findings.map((f) => f.message)).toEqual(['v1', 'v2']);
	});
});
