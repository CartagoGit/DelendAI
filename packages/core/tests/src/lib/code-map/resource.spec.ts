import { describe, expect, it } from 'vitest';

import {
	buildCodeMap,
	type ICodeMap,
	CODE_MAP_SCHEMA_VERSION,
} from '../../../../src/lib/code-map/generator';
import { buildCodeMapResourceRegistration } from '../../../../src/lib/code-map/resource';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface IRegistered {
	readonly name: string;
	readonly uri: string;
	readonly metadata: {
		readonly title?: string;
		readonly description?: string;
		readonly mimeType?: string;
	};
	readonly read: () => Promise<{
		readonly contents: ReadonlyArray<{
			readonly uri: string;
			readonly mimeType: string;
			readonly text: string;
		}>;
	}>;
}

/** Tiny fake `McpServer.registerResource` capturing the handler. */
const fakeServer = (): {
	reg: IRegistered[];
	server: Pick<McpServer, 'registerResource'>;
} => {
	const reg: IRegistered[] = [];
	return {
		reg,
		server: {
			registerResource: (name, uri, metadata, _cb) => {
				const cb = _cb as unknown as () => Promise<{
					contents: ReadonlyArray<{
						uri: string;
						mimeType: string;
						text: string;
					}>;
				}>;
				reg.push({
					name,
					uri: String(uri),
					metadata: metadata as IRegistered['metadata'],
					read: async () => cb() as never,
				});
				return Promise.resolve() as unknown as ReturnType<
					McpServer['registerResource']
				>;
			},
		} as Pick<McpServer, 'registerResource'>,
	};
};

describe('buildCodeMap (d00010)', () => {
	it('returns a snapshot with the schemaVersion banner', async () => {
		const snap = await buildCodeMap(
			() => new Date('2026-08-26T00:00:00.000Z'),
		);
		expect(snap.schemaVersion).toBe(CODE_MAP_SCHEMA_VERSION);
		expect(snap.generatedAt).toBe('2026-08-26T00:00:00.000Z');
		expect(Array.isArray(snap.packages)).toBe(true);
		expect(Array.isArray(snap.plugins)).toBe(true);
		expect(Array.isArray(snap.hotspots)).toBe(true);
	});

	it('does not leak host paths: every entry uses a workspace-relative `dir`', async () => {
		const snap = await buildCodeMap();
		for (const pkg of snap.packages) {
			expect(pkg.dir).not.toMatch(/^\/|^[A-Za-z]:/);
		}
		for (const plugin of snap.plugins) {
			expect(plugin.dir).not.toMatch(/^\/|^[A-Za-z]:/);
		}
	});

	it('lists the four canonical packages with AGENT.md pointers', async () => {
		const snap = await buildCodeMap();
		const dirs = snap.packages.map((p) => p.dir).sort();
		expect(dirs).toContain('packages/core');
		expect(dirs).toContain('packages/cli');
		expect(dirs).toContain('packages/client');
		expect(dirs).toContain('packages/ui-extension');
		for (const pkg of snap.packages) {
			expect(pkg.agent).not.toBeNull();
		}
	});

	it('surfaces at most 32 hotspots sorted by staticBytes desc', async () => {
		const snap = await buildCodeMap();
		expect(snap.hotspots.length).toBeLessThanOrEqual(32);
		for (let i = 1; i < snap.hotspots.length; i += 1) {
			expect(snap.hotspots[i - 1]!.staticBytes).toBeGreaterThanOrEqual(
				snap.hotspots[i]!.staticBytes,
			);
		}
	});
});

describe('buildCodeMapResourceRegistration (d00010)', () => {
	const NOW = new Date('2026-08-26T00:00:00.000Z');
	const NOW_FN: () => Date = () => NOW;

	it('registers a single resource under the canonical `delendai://code-map` URI by default', async () => {
		// b00239 rename: the canonical URI is `delendai://code-map`
		// (was `vertex://code-map`). Old callers that pass the
		// deprecated URI explicitly are still honored (covered by
		// the "accepts the deprecated `vertex://code-map` alias"
		// spec below).
		const reg = buildCodeMapResourceRegistration({ now: NOW_FN });
		const { reg: captured, server } = fakeServer();
		await reg.register(server as unknown as McpServer);
		expect(captured).toHaveLength(1);
		expect(captured[0]?.uri).toBe('delendai://code-map');
		expect(captured[0]?.metadata.mimeType).toBe('application/json');
	});

	it('reads returns the in-memory map serialised as JSON', async () => {
		const reg = buildCodeMapResourceRegistration({
			now: NOW_FN,
			ttlMs: 60_000,
		});
		const { reg: captured, server } = fakeServer();
		await reg.register(server as unknown as McpServer);
		const reader = captured[0]!.read;
		const response = await reader();
		const payload = JSON.parse(response.contents[0]!.text) as ICodeMap;
		expect(payload.schemaVersion).toBe(CODE_MAP_SCHEMA_VERSION);
		expect(payload.generatedAt).toBe(NOW.toISOString());
		// Privacy assertions on the live payload:
		expect(payload.packages.length).toBeGreaterThan(0);
		expect(payload.plugins.length).toBeGreaterThan(0);
	});

	it('respects a custom URI override', async () => {
		const reg = buildCodeMapResourceRegistration({
			uri: 'delendai://custom-map',
		});
		const { reg: captured, server } = fakeServer();
		await reg.register(server as unknown as McpServer);
		expect(captured[0]?.uri).toBe('delendai://custom-map');
	});

	it('accepts the deprecated `vertex://code-map` alias and emits a deprecation warning', async () => {
		// b00239 rename: the URI scheme moved from `vertex://` to
		// `delendai://`. Old configs that still pass the legacy
		// `vertex://code-map` must keep working; the registration
		// mounts at whatever URI the caller requested (so existing
		// MCP hosts don't break), and a deprecation warning is
		// surfaced on stderr so operators see the rename in CI logs.
		const stderrChunks: string[] = [];
		const originalWrite = process.stderr.write.bind(process.stderr);
		process.stderr.write = ((
			chunk: string | Uint8Array,
			...rest: unknown[]
		) => {
			if (typeof chunk === 'string') stderrChunks.push(chunk);
			return (originalWrite as (...args: unknown[]) => boolean)(
				chunk,
				...rest,
			);
		}) as typeof process.stderr.write;
		try {
			const reg = buildCodeMapResourceRegistration({
				uri: 'vertex://code-map',
			});
			const { reg: captured, server } = fakeServer();
			await reg.register(server as unknown as McpServer);
			expect(captured).toHaveLength(1);
			// The deprecated URI is preserved on the registration so
			// the caller's MCP host keeps working — we don't silently
			// rewrite it under them.
			expect(captured[0]?.uri).toBe('vertex://code-map');
			expect(captured[0]?.metadata.mimeType).toBe('application/json');
			const stderr = stderrChunks.join('');
			expect(stderr).toContain('vertex://code-map');
			expect(stderr).toContain('deprecated');
			expect(stderr).toContain('delendai://code-map');
		} finally {
			process.stderr.write = originalWrite;
		}
	});

	it('does NOT emit a deprecation warning for the canonical `delendai://code-map` URI', async () => {
		const stderrChunks: string[] = [];
		const originalWrite = process.stderr.write.bind(process.stderr);
		process.stderr.write = ((
			chunk: string | Uint8Array,
			...rest: unknown[]
		) => {
			if (typeof chunk === 'string') stderrChunks.push(chunk);
			return (originalWrite as (...args: unknown[]) => boolean)(
				chunk,
				...rest,
			);
		}) as typeof process.stderr.write;
		try {
			const reg = buildCodeMapResourceRegistration({
				uri: 'delendai://code-map',
			});
			const { reg: captured, server } = fakeServer();
			await reg.register(server as unknown as McpServer);
			expect(captured[0]?.uri).toBe('delendai://code-map');
			const stderr = stderrChunks.join('');
			expect(stderr).not.toContain('deprecated');
			expect(stderr).not.toContain('vertex://code-map');
		} finally {
			process.stderr.write = originalWrite;
		}
	});
});
