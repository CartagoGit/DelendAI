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

import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
	CAPABILITIES,
	createCapabilityGate,
	isCapability,
	parseCapability,
	parseCapabilityList,
	resolveCapabilityAccess,
	splitCapability,
} from '@delendai/core/public';

import { createCapabilityContext } from '../../../../src/lib/capabilities/inject';
import type {
	Capability,
	ICapabilityRefusal,
} from '../../../../src/lib/capabilities/schema';

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

	// --- f00188 runtime enforcement Proxy (createCapabilityContext) ---
	// The 4 adversarial scenarios the proposal §5 demands, exercised
	// against the real Proxy instead of the pure gate. The Proxy IS
	// the `ctx.capabilities` object — no wrapping `.capabilities` key.

	it('runtime: declared capability resolves to the real implementation', () => {
		const read = vi.fn((path: string) => `data:${path}`);
		const ctx = createCapabilityContext(['fs:read'], {
			fs: { read },
		});
		// `fs.read` is typed on CapabilitiesToCtx<'fs:read'> — no cast.
		expect(ctx.fs.read('/tmp/x')).toBe('data:/tmp/x');
		expect(read).toHaveBeenCalledWith('/tmp/x');
	});

	it('runtime: plugin declaring fs:read gets a refusal for git.write', () => {
		const refusals: ICapabilityRefusal[] = [];
		const ctx = createCapabilityContext(['fs:read'], {}, (r) =>
			refusals.push(r),
		);
		const result = (
			ctx as unknown as {
				git: { write: (args: unknown) => unknown };
			}
		).git.write({ path: 'x' });
		expect(result).toMatchObject({
			kind: 'capability-denied',
			capability: 'git:write',
		});
		expect(refusals).toHaveLength(1);
	});

	it('runtime: empty declaration refuses every capability', () => {
		const ctx = createCapabilityContext([] as Capability[], {});
		const result = (
			ctx as unknown as { fs: { read: (args: unknown) => unknown } }
		).fs.read('/tmp');
		expect(result).toMatchObject({
			kind: 'capability-denied',
			capability: 'fs:read',
		});
	});

	it('runtime: full declaration works normally across every group', () => {
		const ctx = createCapabilityContext(CAPABILITIES, {
			git: {
				read: () => 'g',
				write: () => 'w',
				push: () => 'p',
			},
			fs: { read: () => 'r', write: () => 'f' },
			network: { fetch: () => 'n' },
			process: { spawn: () => 's' },
			memory: { read: () => 'mr', write: () => 'mw' },
		});
		expect(ctx.git.write({})).toBe('w');
		expect(ctx.fs.read('/x')).toBe('r');
		expect(ctx.network.fetch('u')).toBe('n');
		expect(ctx.process.spawn('cmd')).toBe('s');
		expect(ctx.memory.read('k')).toBe('mr');
	});

	it('runtime: as-any bypass receives the refusal, not a crash', () => {
		const ctx = createCapabilityContext(['fs:read'], {});
		const value = (
			ctx as unknown as { network: { fetch: (args: unknown) => unknown } }
		).network.fetch('x');
		expect(value).toMatchObject({
			kind: 'capability-denied',
			capability: 'network:fetch',
		});
	});

	it('runtime: granted-but-unwired capability throws a loud wiring error', () => {
		const ctx = createCapabilityContext(['fs:read'], {});
		const read = (
			ctx as unknown as { fs: { read: (args: unknown) => unknown } }
		).fs.read;
		expect(() => read('/tmp')).toThrow(
			/granted but no implementation is registered/,
		);
	});

	it('runtime: the Proxy is not a thenable (safe to await around)', async () => {
		const ctx = createCapabilityContext(['fs:read'], {});
		// `then` must be undefined so `Promise.resolve(ctx)` does not
		// treat the Proxy as a thenable.
		expect((ctx as unknown as { then?: unknown }).then).toBeUndefined();
		await expect(Promise.resolve(ctx)).resolves.toBeDefined();
	});

	it('type-level: CapabilitiesToCtx exposes only the declared subset', () => {
		const ctx = createCapabilityContext(['fs:read'] as const, {
			fs: { read: () => 'ok' },
		});
		expectTypeOf(ctx.fs.read).toBeFunction();
		// @ts-expect-error — git is not part of CapabilitiesToCtx<'fs:read'>
		ctx.git.write;
	});

	it('type-level: CapabilitiesToCtx maps a multi-group union to its shape', () => {
		const ctx = createCapabilityContext(['fs:read', 'git:write'] as const, {
			fs: { read: () => 'r' },
			git: { write: () => 'w' },
		});
		expectTypeOf(ctx.fs.read).toBeFunction();
		expectTypeOf(ctx.git.write).toBeFunction();
		// @ts-expect-error — git.read is not declared, only git.write
		ctx.git.read;
	});
});
