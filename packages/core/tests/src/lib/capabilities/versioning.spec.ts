/**
 * versioning.spec.ts — f00194 (Track K / capability versioning).
 *
 * Pins the semver resolution contract:
 *   - `^`, `~`, `>=`, `=`, `*` ranges all behave as expected.
 *   - Mismatch produces a refusal with the full available list.
 *   - Legacy (non-versioned) capabilities are treated as `0.0.0`,
 *     so any range matches.
 *   - Multiple matching versions → highest wins.
 *   - The activator (`checkCapabilityRequirements`) is pure: same
 *     input ⇒ same output.
 *
 * Privacy (R1.1): the suite uses synthetic capability ids only —
 * no tool names, no plugin author info.
 */

import { describe, expect, it } from 'vitest';

import {
	WILDCARD_RANGE,
	buildAvailableVersions,
	checkCapabilityRequirements,
	formatCapabilityVersionRefusal,
	legacyVersionedCapability,
	parseCapabilityRequirement,
	resolveAllCapabilityVersions,
	resolveCapabilityVersion,
	type IVersionedCapability,
} from '@delendai/core/public';

const PROVIDED: readonly IVersionedCapability[] = [
	{ capability: 'git:read', version: '1.0.0', transport: 'inline' },
	{ capability: 'git:read', version: '1.2.3', transport: 'inline' },
	{ capability: 'git:write', version: '2.0.0', transport: 'inline' },
	{ capability: 'git:write', version: '2.1.4', transport: 'inline' },
	{ capability: 'fs:read', version: '1.4.0', transport: 'inline' },
	{ capability: 'fs:write', version: '0.9.0', transport: 'inline' },
];

describe('f00194 — capability versioning (Track K)', () => {
	describe('parseCapabilityRequirement', () => {
		it('accepts undefined/null and returns a frozen empty object', () => {
			const a = parseCapabilityRequirement(undefined);
			const b = parseCapabilityRequirement(null);
			expect(a).toEqual({});
			expect(b).toEqual({});
			expect(Object.isFrozen(a)).toBe(true);
		});

		it('round-trips a valid requirement', () => {
			const req = parseCapabilityRequirement({
				'git:write': '^2.0.0',
				'fs:read': '>=1.2.0',
			});
			expect({ ...req }).toEqual({
				'git:write': '^2.0.0',
				'fs:read': '>=1.2.0',
			});
		});

		it('throws on a non-object input', () => {
			expect(() => parseCapabilityRequirement('^2.0.0')).toThrow(
				/expected an object/,
			);
			expect(() => parseCapabilityRequirement([])).toThrow(
				/expected an object/,
			);
		});

		it('throws on empty capability key or empty range string', () => {
			expect(() => parseCapabilityRequirement({ '': '^2.0.0' })).toThrow(
				/non-empty string/,
			);
			expect(() =>
				parseCapabilityRequirement({ 'git:write': '' }),
			).toThrow(/non-empty semver/);
			expect(() =>
				parseCapabilityRequirement({
					'git:write': 42 as unknown as string,
				}),
			).toThrow(/non-empty semver/);
		});
	});

	describe('resolveCapabilityVersion — semver range semantics', () => {
		it('^2 accepts 2.0.0 and 2.3.4', () => {
			expect(
				resolveCapabilityVersion('git:write', '^2.0.0', PROVIDED).kind,
			).toBe('capability-version-ok');
			const ok = resolveCapabilityVersion(
				'git:write',
				'^2.0.0',
				PROVIDED,
			);
			expect(ok).toMatchObject({
				kind: 'capability-version-ok',
				capability: 'git:write',
				required: '^2.0.0',
				version: '2.1.4',
			});
		});

		it('^2 rejects 1.x and 3.0.0', () => {
			const noMatch = resolveCapabilityVersion('git:write', '^2.0.0', [
				{ capability: 'git:write', version: '1.0.0' },
			]);
			expect(noMatch.kind).toBe('capability-version-mismatch');
			const noMatchMajor = resolveCapabilityVersion(
				'git:write',
				'^2.0.0',
				[{ capability: 'git:write', version: '3.0.0' }],
			);
			expect(noMatchMajor.kind).toBe('capability-version-mismatch');
		});

		it('~1.4 accepts 1.4.x and rejects 1.5.0', () => {
			const ok = resolveCapabilityVersion('fs:read', '~1.4.0', PROVIDED);
			expect(ok.kind).toBe('capability-version-ok');
			expect((ok as { version: string }).version).toBe('1.4.0');
			const noMatch = resolveCapabilityVersion('fs:read', '~1.4.0', [
				{ capability: 'fs:read', version: '1.5.0' },
			]);
			expect(noMatch.kind).toBe('capability-version-mismatch');
		});

		it('>=2 accepts 2.5.0', () => {
			expect(
				resolveCapabilityVersion('git:write', '>=2', [
					{ capability: 'git:write', version: '2.5.0' },
				]).kind,
			).toBe('capability-version-ok');
		});

		it('=2.0.0 accepts only the exact version', () => {
			expect(
				resolveCapabilityVersion('git:write', '=2.0.0', PROVIDED).kind,
			).toBe('capability-version-ok');
			expect(
				resolveCapabilityVersion('git:write', '=2.0.0', [
					{ capability: 'git:write', version: '2.0.1' },
				]).kind,
			).toBe('capability-version-mismatch');
		});

		it('wildcard (*) matches any provided version (highest wins)', () => {
			const ok = resolveCapabilityVersion(
				'git:write',
				WILDCARD_RANGE,
				PROVIDED,
			);
			expect(ok.kind).toBe('capability-version-ok');
			expect((ok as { version: string }).version).toBe('2.1.4');
		});

		it('refusal includes the full available list (audit-friendly)', () => {
			const result = resolveCapabilityVersion(
				'git:write',
				'^3.0.0',
				PROVIDED,
			);
			expect(result.kind).toBe('capability-version-mismatch');
			if (result.kind !== 'capability-version-mismatch') {
				throw new Error('expected a refusal');
			}
			expect(result.available).toEqual(['2.0.0', '2.1.4']);
			expect(result.capability).toBe('git:write');
			expect(result.required).toBe('^3.0.0');
		});

		it('refusal with empty available list when the capability is absent', () => {
			const result = resolveCapabilityVersion(
				'process:spawn',
				'^1.0.0',
				[],
			);
			expect(result.kind).toBe('capability-version-mismatch');
			if (result.kind !== 'capability-version-mismatch') {
				throw new Error('expected a refusal');
			}
			expect(result.available).toEqual([]);
		});

		it('picks the highest matching version when multiple match', () => {
			const result = resolveCapabilityVersion(
				'git:read',
				'>=1.0.0',
				PROVIDED,
			);
			expect(result.kind).toBe('capability-version-ok');
			expect((result as { version: string }).version).toBe('1.2.3');
		});
	});

	describe('legacy compatibility', () => {
		it('legacy 0.0.0 capabilities satisfy any range', () => {
			const legacy = [legacyVersionedCapability('fs:write')];
			expect(
				resolveCapabilityVersion('fs:write', '^5.0.0', legacy).kind,
			).toBe('capability-version-ok');
			expect(
				resolveCapabilityVersion('fs:write', '>=1.0.0', legacy).kind,
			).toBe('capability-version-ok');
		});

		it('legacyVersionedCapability preserves the typed id', () => {
			const legacy = legacyVersionedCapability('git:write');
			expect(legacy).toEqual({
				capability: 'git:write',
				version: '0.0.0',
				transport: 'inline',
			});
		});
	});

	describe('buildAvailableVersions', () => {
		it('combines declared + provided, fills missing with legacy 0.0.0', () => {
			const declared = ['git:write', 'fs:read'];
			const provided: IVersionedCapability[] = [
				{ capability: 'git:write', version: '2.1.0' },
			];
			const available = buildAvailableVersions(declared, provided);
			const byCap = Object.fromEntries(
				available.map((entry) => [entry.capability, entry]),
			);
			expect(byCap['git:write']?.version).toBe('2.1.0');
			expect(byCap['fs:read']?.version).toBe('0.0.0');
		});

		it('drops provided entries that the plugin did not declare', () => {
			const declared = ['git:read'];
			const provided: IVersionedCapability[] = [
				{ capability: 'git:read', version: '1.0.0' },
				{ capability: 'git:write', version: '2.0.0' },
			];
			const available = buildAvailableVersions(declared, provided);
			expect(available.map((entry) => entry.capability)).toEqual([
				'git:read',
			]);
		});
	});

	describe('checkCapabilityRequirements — the activation gate', () => {
		it('returns null when every requirement is satisfied', () => {
			const req = parseCapabilityRequirement({ 'git:write': '^2.0.0' });
			const refusal = checkCapabilityRequirements(
				req,
				['git:write'],
				PROVIDED,
			);
			expect(refusal).toBeNull();
		});

		it('returns the FIRST mismatch refusal (fail-fast)', () => {
			const req = parseCapabilityRequirement({
				'git:write': '^2.0.0',
				'fs:read': '>=99.0.0',
			});
			const refusal = checkCapabilityRequirements(
				req,
				['git:write', 'fs:read'],
				PROVIDED,
			);
			expect(refusal).not.toBeNull();
			expect(refusal?.capability).toBe('fs:read');
			expect(refusal?.required).toBe('>=99.0.0');
		});

		it('treats a capability in `requires` but absent from the host as a refusal', () => {
			const req = parseCapabilityRequirement({
				'process:spawn': '^1.0.0',
			});
			const refusal = checkCapabilityRequirements(req, ['git:write'], []);
			expect(refusal?.kind).toBe('capability-version-mismatch');
			expect(refusal?.capability).toBe('process:spawn');
			expect(refusal?.available).toEqual([]);
		});

		it('is pure: same input ⇒ same output', () => {
			const req = parseCapabilityRequirement({ 'git:write': '^2.0.0' });
			const a = checkCapabilityRequirements(req, ['git:write'], PROVIDED);
			const b = checkCapabilityRequirements(req, ['git:write'], PROVIDED);
			expect(a).toBeNull();
			expect(b).toBeNull();
		});
	});

	describe('resolveAllCapabilityVersions', () => {
		it('returns a frozen result map keyed by capability', () => {
			const req = parseCapabilityRequirement({
				'git:write': '^2.0.0',
				'fs:read': '>=1.0.0',
				'network:fetch': '^9.0.0',
			});
			const result = resolveAllCapabilityVersions(req, PROVIDED);
			expect(Object.isFrozen(result)).toBe(true);
			expect(result['git:write']?.kind).toBe('capability-version-ok');
			expect(result['fs:read']?.kind).toBe('capability-version-ok');
			expect(result['network:fetch']?.kind).toBe(
				'capability-version-mismatch',
			);
		});

		it('returns an empty object for an empty requirement', () => {
			const result = resolveAllCapabilityVersions(
				parseCapabilityRequirement({}),
				PROVIDED,
			);
			expect({ ...result }).toEqual({});
		});
	});

	describe('formatCapabilityVersionRefusal', () => {
		it('renders a deterministic single-line message', () => {
			const line = formatCapabilityVersionRefusal({
				kind: 'capability-version-mismatch',
				capability: 'git:write',
				required: '^2.0.0',
				available: ['1.0.0', '1.2.3'],
			});
			expect(line).toBe(
				'capability-version-mismatch: git:write requires ^2.0.0 but host offers [1.0.0, 1.2.3]',
			);
		});

		it('marks an empty available list as <none>', () => {
			const line = formatCapabilityVersionRefusal({
				kind: 'capability-version-mismatch',
				capability: 'process:spawn',
				required: '^1.0.0',
				available: [],
			});
			expect(line).toContain('<none>');
		});
	});
});
