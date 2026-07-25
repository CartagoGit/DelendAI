/**
 * x00072 SEC-001 S3 — `.mcp.json` drift integration tests.
 *
 * The trust fingerprint is invalidated when the workspace's `.mcp.json`
 * body changes (even if the launch `command | args | cwd` stays the
 * same). These specs run the helper pair (`isLaunchApproved`,
 * `recordApproval`, `clearApproval`) end-to-end against a real
 * `.mcp.json` on disk so the SHA-256 hash is computed on the actual
 * file bytes the gate will see at runtime.
 *
 * They complement `trust-gate-integration.spec.ts` (which exercises the
 * `activate()` flow) and `trust-gate.spec.ts` (which is unit-scoped).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	clearApproval,
	computeMcpJsonHash,
	isLaunchApproved,
	recordApproval,
	type IFingerprintStore,
} from '../commands/trust-fingerprint';

class MemoryGlobalState implements IFingerprintStore {
	private readonly map = new Map<string, unknown>();
	get<T>(key: string): T | undefined {
		return this.map.get(key) as T | undefined;
	}
	async update(key: string, value: unknown): Promise<void> {
		if (value === undefined) this.map.delete(key);
		else this.map.set(key, value);
	}
}

const baseLaunch = {
	command: 'bun',
	args: ['run', 'mcp-vertex'],
} as const;

describe('x00072 SEC-001 S3 .mcp.json drift', () => {
	let cwd = '';
	let store: MemoryGlobalState;

	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), 'trust-mcp-json-'));
		store = new MemoryGlobalState();
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	it('first approval with a `.mcp.json` body is accepted', async () => {
		const body =
			'{"mcpServers":{"mcp-vertex":{"command":"bun","args":["run","mcp-vertex"]}}}';
		writeFileSync(join(cwd, '.mcp.json'), body, 'utf8');

		expect(isLaunchApproved(store, baseLaunch, body)).toBe(false);
		await recordApproval(store, baseLaunch, body);
		expect(isLaunchApproved(store, baseLaunch, body)).toBe(true);
	});

	it('editing `.mcp.json` contents invalidates the cached fingerprint', async () => {
		const body1 =
			'{"mcpServers":{"mcp-vertex":{"command":"bun","args":["run","mcp-vertex"]}}}';
		const body2 =
			'{"mcpServers":{"mcp-vertex":{"command":"bun","args":["evil"]}}}';
		writeFileSync(join(cwd, '.mcp.json'), body1, 'utf8');
		await recordApproval(store, baseLaunch, body1);
		expect(isLaunchApproved(store, baseLaunch, body1)).toBe(true);

		// The launch fingerprint is identical (command+args+cwd), but the
		// `.mcp.json` body changed. The helper MUST require re-approval.
		writeFileSync(join(cwd, '.mcp.json'), body2, 'utf8');
		expect(isLaunchApproved(store, baseLaunch, body2)).toBe(false);

		// Whitespace-only edits change the raw bytes → the hash differs.
		const body1Indented = `${body1}\n  `;
		expect(isLaunchApproved(store, baseLaunch, body1Indented)).toBe(false);

		// Re-approving with the new body lets the flow proceed again.
		await recordApproval(store, baseLaunch, body2);
		expect(isLaunchApproved(store, baseLaunch, body2)).toBe(true);
	});

	it('removing `.mcp.json` invalidates when the prior hash was set', async () => {
		const body =
			'{"mcpServers":{"mcp-vertex":{"command":"bun","args":["run","mcp-vertex"]}}}';
		writeFileSync(join(cwd, '.mcp.json'), body, 'utf8');
		await recordApproval(store, baseLaunch, body);

		// The file is deleted; the runtime passes `undefined` (no body).
		// The helper uses the stored hash, so a now-empty workspace should
		// require re-approval rather than silently launching.
		expect(isLaunchApproved(store, baseLaunch, undefined)).toBe(false);

		// Re-approval with no `.mcp.json` would let the gate proceed for
		// launches that don't depend on a server config body.
		await recordApproval(store, baseLaunch, undefined);
		expect(isLaunchApproved(store, baseLaunch, undefined)).toBe(true);
	});

	it('launch fingerprint mismatch invalidates even when `.mcp.json` matches', async () => {
		const body =
			'{"mcpServers":{"mcp-vertex":{"command":"bun","args":["run","mcp-vertex"]}}}';
		writeFileSync(join(cwd, '.mcp.json'), body, 'utf8');
		await recordApproval(store, baseLaunch, body);

		const tamperedLaunch = {
			command: 'bun',
			args: ['run', 'mcp-vertex', '--unsafe'],
		};
		expect(isLaunchApproved(store, tamperedLaunch, body)).toBe(false);
	});

	it('clearApproval erases both the fingerprint and the .mcp.json hash', async () => {
		const body =
			'{"mcpServers":{"mcp-vertex":{"command":"bun","args":["run","mcp-vertex"]}}}';
		writeFileSync(join(cwd, '.mcp.json'), body, 'utf8');
		await recordApproval(store, baseLaunch, body);
		expect(isLaunchApproved(store, baseLaunch, body)).toBe(true);

		await clearApproval(store);
		expect(isLaunchApproved(store, baseLaunch, body)).toBe(false);
	});

	it('computeMcpJsonHash ignores empty / undefined bodies', () => {
		expect(computeMcpJsonHash(undefined)).toBeUndefined();
		expect(computeMcpJsonHash('')).toBeUndefined();
		expect(computeMcpJsonHash('{}')).toMatch(/^[a-f0-9]{64}$/);
	});
});
