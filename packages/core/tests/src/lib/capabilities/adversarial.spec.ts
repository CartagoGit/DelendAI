/**
 * adversarial.spec.ts — f00188 (Track F / security).
 *
 * Adversarial tests for the capability gate. Each test names one
 * threat the gate must defend against:
 *   1. Plugin declares an empty set and tries to read git → refusal.
 *   2. Plugin declares only `fs:read` and tries to write → refusal.
 *   3. Plugin declares a capability that doesn't exist → refusal.
 *   4. Plugin that bypasses the type system still hits the gate.
 *   5. The gate is pure: same inputs ⇒ same output (no surprises).
 *
 * The tests are deliberately pure (no Proxy, no router) — they
 * pin the contract that the router, lint and matrix generator all
 * depend on.
 */

import { describe, expect, it } from 'vitest';

import {
	CAPABILITIES,
	createCapabilityGate,
	isCapability,
	parseCapability,
	parseCapabilityList,
	resolveCapabilityAccess,
	splitCapability,
} from '@mcp-vertex/core/public';

describe('f00188 — capability gate adversarial (Track F)', () => {
	it('rejects an unknown capability token (compile-time unknown literal)', () => {
		expect(isCapability('network:fetch')).toBe(true);
		expect(isCapability('network:teleport')).toBe(false);
		expect(isCapability('')).toBe(false);
		expect(isCapability(undefined)).toBe(false);
		expect(isCapability(42)).toBe(false);
	});

	it('rejects an empty declaration trying to read anything', () => {
		const gate = createCapabilityGate([]);
		const refusal = gate('git:read');
		expect(refusal).not.toBeNull();
		expect(refusal?.kind).toBe('capability-denied');
		expect(refusal?.capability).toBe('git:read');
		expect(refusal?.declared).toEqual([]);
	});

	it('rejects a read-only declaration trying to write', () => {
		const gate = createCapabilityGate(['fs:read']);
		expect(gate('fs:read')).toBeNull();
		const refusal = gate('fs:write');
		expect(refusal).not.toBeNull();
		expect(refusal?.kind).toBe('capability-denied');
		expect(refusal?.capability).toBe('fs:write');
	});

	it('rejects a capability outside the declared scope (least-privilege)', () => {
		const gate = createCapabilityGate(['git:read', 'fs:read']);
		expect(gate('network:fetch')).toMatchObject({
			kind: 'capability-denied',
			capability: 'network:fetch',
		});
		expect(gate('process:spawn')).toMatchObject({
			kind: 'capability-denied',
			capability: 'process:spawn',
		});
	});

	it('grants the exact capability it declared (positive path)', () => {
		const gate = createCapabilityGate(['git:write']);
		expect(gate('git:write')).toBeNull();
		// Negative cross-check: same gate, related capability → refusal.
		expect(gate('git:read')?.kind).toBe('capability-denied');
		expect(gate('git:push')?.kind).toBe('capability-denied');
	});

	it('pure resolveCapabilityAccess returns the same verdict for the same inputs', () => {
		const declared = ['git:read', 'fs:read'] as const;
		const first = resolveCapabilityAccess([...declared], 'git:write');
		const second = resolveCapabilityAccess([...declared], 'git:write');
		expect(first).toEqual(second);
		expect(first?.kind).toBe('capability-denied');
	});

	it('parseCapability throws on unknown input, parseCapabilityList tolerates a single bad entry by throwing too', () => {
		expect(() => parseCapability('git:read')).not.toThrow();
		expect(() => parseCapability('git:teleport')).toThrow(
			/unknown capability/,
		);
		expect(() =>
			parseCapabilityList(['git:read', 'fs:write']),
		).not.toThrow();
		expect(() =>
			parseCapabilityList(['git:read', 'fs:write', 42]),
		).toThrow();
	});

	it('CAPABILITIES is the canonical, alphabetically-sorted runtime list', () => {
		const sorted = [...CAPABILITIES].sort();
		expect([...CAPABILITIES]).toEqual(sorted);
		// Every entry must round-trip through parseCapability.
		for (const value of CAPABILITIES) {
			expect(parseCapability(value)).toBe(value);
		}
	});

	it('splitCapability slices <group>:<action> correctly', () => {
		expect(splitCapability('git:write')).toEqual({
			group: 'git',
			action: 'write',
		});
		expect(splitCapability('network:fetch')).toEqual({
			group: 'network',
			action: 'fetch',
		});
		// Malformed inputs return null — the caller decides how to react.
		expect(splitCapability('git:read:extra')).toEqual({
			group: 'git',
			action: 'read:extra',
		});
		expect(splitCapability('git')).toBeNull();
		expect(splitCapability(':read')).toBeNull();
		expect(splitCapability('git:')).toBeNull();
	});
});
