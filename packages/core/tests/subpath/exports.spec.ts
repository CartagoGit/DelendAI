/**
 * subpath-exports.spec.ts — r00028 (Track C / §9).
 *
 * Smoke tests for the four subpath exports added to
 * `@delendai/core`: `./contracts`, `./runtime`, `./plugin`,
 * `./node`. Each subpath must resolve + expose at least one
 * expected symbol. This is the contract enforcement: any
 * future refactor that breaks one of these subpaths will fail
 * here before users see it.
 */

import { describe, expect, it } from 'vitest';

describe('@delendai/core subpath exports (r00028)', () => {
	it('./contracts exposes shared envelope helpers', async () => {
		const contracts = await import('@delendai/core/contracts');
		expect(typeof contracts.isOperationSuccess).toBe('function');
		expect(typeof contracts.isOperationFailure).toBe('function');
		expect(typeof contracts.success).toBe('function');
		expect(typeof contracts.failure).toBe('function');
	});

	it('./runtime exposes commitAndPush', async () => {
		const runtime = await import('@delendai/core/runtime');
		expect(typeof runtime.commitAndPush).toBe('function');
		expect(typeof runtime.writeFileAtomic).toBe('function');
		expect(typeof runtime.withFileMutex).toBe('function');
		expect(typeof runtime.SafeWorkspaceReader).toBe('function');
	});

	it('./plugin exposes definePlugin + loadPlugins', async () => {
		const plugin = await import('@delendai/core/plugin');
		expect(typeof plugin.definePlugin).toBe('function');
		expect(typeof plugin.loadPlugins).toBe('function');
		expect(typeof plugin.parseCliArgs).toBe('function');
	});

	it('./node exposes Node-only runtime helpers', async () => {
		const node = await import('@delendai/core/node');
		expect(typeof node.commitAndPush).toBe('function');
		expect(typeof node.writeFileAtomic).toBe('function');
		expect(typeof node.withFileMutex).toBe('function');
		expect(typeof node.SafeWorkspaceReader).toBe('function');
		expect(typeof node.loadPlugins).toBe('function');
	});

	it('./public still exposes the legacy surface (compatibility)', async () => {
		const pub = await import('@delendai/core/public');
		expect(typeof pub.commitAndPush).toBe('function');
		expect(typeof pub.definePlugin).toBe('function');
		expect(typeof pub.SafeWorkspaceReader).toBe('function');
	});
});
