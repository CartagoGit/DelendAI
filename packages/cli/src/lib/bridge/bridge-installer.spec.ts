/**
 * bridge-installer.spec.ts — b00239 S3.
 *
 * Pins the four cases the plan calls out (install new, install over
 * own, install over foreign, uninstall) plus the supporting
 * invariants the recogniser relies on (marker, idempotency, foreign
 * is never touched). The IO is an in-memory map so the suite runs
 * everywhere equally and the integration spec (`integration.spec.ts`)
 * is the one that pins real-fs behaviour.
 */

import { describe, expect, it } from 'vitest';

import { BRIDGE_MARKER } from '../../contracts/constants/bridge.constant';
import type {
	IBridgeEnvironment,
	IBridgeIo,
	IBridgeLegacyBinary,
} from '../../contracts/interfaces/bridge.interface';
import {
	DEFAULT_BRIDGE_LEGACY_BINARIES,
	bridgeShimPaths,
	installBridgeDirectory,
	installBridgeShim,
	readBridgeDirectoryStatus,
	readBridgeShimState,
	removeBridgeDirectory,
	renderBridgeShim,
} from './bridge-installer';
import {
	POSIX_BRIDGE_SHIM_BODY,
	WINDOWS_CMD_BRIDGE_SHIM_BODY,
	WINDOWS_PS1_BRIDGE_SHIM_BODY,
} from './shim-templates';

const POSIX: IBridgeEnvironment = {
	platform: 'posix',
	workspaceRoot: '/workspace',
	canonical: 'delendai',
};

const WINDOWS: IBridgeEnvironment = {
	platform: 'win32',
	workspaceRoot: '/workspace',
	canonical: 'delendai',
};

const ioOver = (
	files: Record<string, string>,
	overrides: Partial<IBridgeIo> = {},
): IBridgeIo & { files: Record<string, string> } => ({
	files,
	read: async (path) => files[path],
	write: async (path, contents) => {
		files[path] = contents;
	},
	remove: async (path) => {
		delete files[path];
	},
	exists: async (path) => path in files,
	join: (...parts) => parts.join('/'),
	...overrides,
});

describe('bridge shim paths', () => {
	it('POSIX writes a single executable', () => {
		const io = ioOver({});
		expect(bridgeShimPaths('mcp-vertex', POSIX, io)).toEqual([
			'/workspace/scripts/legacy-bridge/mcp-vertex',
		]);
	});

	it('Windows writes both .cmd and .ps1', () => {
		const io = ioOver({});
		expect(bridgeShimPaths('mcp-vertex', WINDOWS, io)).toEqual([
			'/workspace/scripts/legacy-bridge/mcp-vertex.cmd',
			'/workspace/scripts/legacy-bridge/mcp-vertex.ps1',
		]);
	});
});

describe('renderBridgeShim', () => {
	it('POSIX body carries the marker, the canonical name, and the legacy name', () => {
		const raws = renderBridgeShim('mcp-vertex', POSIX);
		expect(raws).toHaveLength(1);
		const body = raws[0]!.body;
		expect(body).toContain(BRIDGE_MARKER);
		expect(body).toContain('mcp-vertex');
		expect(body).toContain('delendai');
		expect(body.startsWith('#!/bin/sh')).toBe(true);
		expect(body).toContain('exec "delendai" "$@"');
		expect(body).toContain('exit 127');
	});

	it('Windows bodies carry the marker on both .cmd and .ps1', () => {
		const raws = renderBridgeShim('mcp-vertex', WINDOWS);
		expect(raws.map((r) => r.path)).toEqual([
			'mcp-vertex.cmd',
			'mcp-vertex.ps1',
		]);
		expect(raws[0]!.body).toContain(BRIDGE_MARKER.slice(2));
		expect(raws[1]!.body).toContain(BRIDGE_MARKER.slice(2));
		expect(raws[0]!.crlf).toBe(true);
		expect(raws[1]!.crlf).toBe(false);
	});

	it('POSIX templates and shim templates agree byte-for-byte', () => {
		// renderBridgeShim is the installer's source of truth; the
		// exported shim-templates must agree so a future edit to one
		// does not silently diverge from the other.
		const raws = renderBridgeShim('mcp-vertex', POSIX);
		expect(raws[0]!.body).toBe(
			POSIX_BRIDGE_SHIM_BODY({
				legacyName: 'mcp-vertex',
				canonical: 'delendai',
			}),
		);
		const win = renderBridgeShim('mcp-vertex', WINDOWS);
		expect(win[0]!.body).toBe(
			WINDOWS_CMD_BRIDGE_SHIM_BODY({
				legacyName: 'mcp-vertex',
				canonical: 'delendai',
			}),
		);
		expect(win[1]!.body).toBe(
			WINDOWS_PS1_BRIDGE_SHIM_BODY({
				legacyName: 'mcp-vertex',
				canonical: 'delendai',
			}),
		);
	});
});

describe('readBridgeShimState', () => {
	it('reports `absent` when nothing is there', async () => {
		const io = ioOver({});
		const status = await readBridgeShimState('mcp-vertex', POSIX, io);
		expect(status.state).toBe('absent');
	});

	it('reports `ours` when the marker matches', async () => {
		const io = ioOver({
			'/workspace/scripts/legacy-bridge/mcp-vertex':
				POSIX_BRIDGE_SHIM_BODY({
					legacyName: 'mcp-vertex',
					canonical: 'delendai',
				}),
		});
		expect((await readBridgeShimState('mcp-vertex', POSIX, io)).state).toBe(
			'ours',
		);
	});

	it('reports `foreign` for unknown content (does NOT replace it)', async () => {
		const foreign = '#!/bin/sh\necho "some other tool"\n';
		const io = ioOver({
			'/workspace/scripts/legacy-bridge/mcp-vertex': foreign,
		});
		const status = await readBridgeShimState('mcp-vertex', POSIX, io);
		expect(status.state).toBe('foreign');
		expect(status.occupiedBy).toBe('#!/bin/sh');
	});

	it('reports `unreadable` rather than guessing when read throws', async () => {
		const io = ioOver(
			{ '/workspace/scripts/legacy-bridge/mcp-vertex': 'x' },
			{
				read: async () => {
					throw new Error('EACCES');
				},
			},
		);
		const status = await readBridgeShimState('mcp-vertex', POSIX, io);
		expect(status.state).toBe('unreadable');
	});
});

describe('installBridgeShim', () => {
	it('case 1 — install new: creates the file with the marker', async () => {
		const io = ioOver({});
		const outcome = await installBridgeShim('mcp-vertex', POSIX, io);
		expect(outcome.action).toBe('created');
		const onDisk = io.files['/workspace/scripts/legacy-bridge/mcp-vertex'];
		expect(onDisk).toBeDefined();
		expect(onDisk).toContain(BRIDGE_MARKER);
		expect(onDisk).toContain('mcp-vertex');
	});

	it('case 2 — install over own: idempotent, byte-for-byte identical', async () => {
		const io = ioOver({});
		await installBridgeShim('mcp-vertex', POSIX, io);
		const before = { ...io.files };
		const second = await installBridgeShim('mcp-vertex', POSIX, io);
		expect(second.action).toBe('unchanged');
		expect(io.files).toEqual(before);
	});

	it('case 3 — install over foreign: refuses, file unchanged byte-for-byte', async () => {
		const foreign = '#!/bin/sh\nexec /usr/local/bin/some-other-tool "$@"\n';
		const io = ioOver({
			'/workspace/scripts/legacy-bridge/mcp-vertex': foreign,
		});
		const outcome = await installBridgeShim('mcp-vertex', POSIX, io);
		expect(outcome.action).toBe('refused');
		expect(outcome.status.state).toBe('foreign');
		expect(io.files['/workspace/scripts/legacy-bridge/mcp-vertex']).toBe(
			foreign,
		);
		expect(outcome.detail).toContain('mcp-vertex');
	});

	it('case 4 — write failure: reports `failed` rather than lying about success', async () => {
		const io = ioOver(
			{},
			{
				write: async () => {
					throw new Error('EROFS');
				},
			},
		);
		const outcome = await installBridgeShim('mcp-vertex', POSIX, io);
		expect(outcome.action).toBe('failed');
		expect(outcome.detail).toContain('not fatal');
	});

	it('marks a POSIX shim executable', async () => {
		const made: string[] = [];
		const io = ioOver(
			{},
			{
				makeExecutable: async (path) => {
					made.push(path);
				},
			},
		);
		await installBridgeShim('mcp-vertex', POSIX, io);
		expect(made).toEqual(['/workspace/scripts/legacy-bridge/mcp-vertex']);
	});
});

describe('installBridgeDirectory + removeBridgeDirectory', () => {
	it('installDirectory writes shims for every legacy name and a README', async () => {
		const io = ioOver({});
		const outcome = await installBridgeDirectory(POSIX, io);
		expect(outcome.action).toBe('created');
		expect(outcome.perShim).toHaveLength(
			DEFAULT_BRIDGE_LEGACY_BINARIES.length,
		);
		expect(
			io.files['/workspace/scripts/legacy-bridge/mcp-vertex'],
		).toBeDefined();
		expect(io.files['/workspace/scripts/legacy-bridge/mcpv']).toBeDefined();
		expect(
			io.files['/workspace/scripts/legacy-bridge/README.md'],
		).toBeDefined();
	});

	it('installDirectory is idempotent on second run', async () => {
		const io = ioOver({});
		await installBridgeDirectory(POSIX, io);
		const before = { ...io.files };
		const second = await installBridgeDirectory(POSIX, io);
		expect(second.action).toBe('unchanged');
		expect(io.files).toEqual(before);
	});

	it('readDirectoryStatus reports each shim with its own state', async () => {
		const io = ioOver({});
		await installBridgeDirectory(POSIX, io);
		const status = await readBridgeDirectoryStatus(POSIX, io);
		expect(status.canonical).toBe('delendai');
		expect(status.bridgeDir).toBe('/workspace/scripts/legacy-bridge');
		expect(status.readmePresent).toBe(true);
		expect(status.shims.map((s) => s.legacyName)).toEqual([
			'mcp-vertex',
			'mcpv',
		]);
		expect(status.shims.every((s) => s.state === 'ours')).toBe(true);
	});

	it('legacyNames override (string[]) is honoured', async () => {
		// A consumer that declares two distinct legacy names via the
		// `legacyNames` field of the IO surface should see two distinct
		// shims in the result.
		const list: readonly import('../../contracts/interfaces/bridge.interface').IBridgeLegacyBinary[] =
			['mcp-vertex', 'mcpv'];
		const distinct = Array.from(new Set(list));
		const io = ioOver({}, { legacyNames: list });
		const outcome = await installBridgeDirectory(POSIX, io);
		expect(outcome.status.shims.length).toBe(distinct.length);
		expect(outcome.perShim.every((p) => p.action === 'created')).toBe(true);
	});

	it('case 4 — removeDirectory deletes only own files; foreign is untouched', async () => {
		const io = ioOver({});
		await installBridgeDirectory(POSIX, io);
		const foreign = '#!/bin/sh\nexec /usr/local/bin/other-tool "$@"\n';
		io.files['/workspace/scripts/legacy-bridge/extra.bin'] = foreign;

		const outcome = await removeBridgeDirectory(POSIX, io);
		expect(outcome.action).toBe('created');
		expect(
			io.files['/workspace/scripts/legacy-bridge/mcp-vertex'],
		).toBeUndefined();
		expect(
			io.files['/workspace/scripts/legacy-bridge/mcpv'],
		).toBeUndefined();
		expect(io.files['/workspace/scripts/legacy-bridge/extra.bin']).toBe(
			foreign,
		);
	});

	it('removeDirectory refuses to remove a foreign shim', async () => {
		const foreign = '#!/bin/sh\necho other\n';
		const io = ioOver({
			'/workspace/scripts/legacy-bridge/mcp-vertex': foreign,
		});
		const outcome = await removeBridgeDirectory(POSIX, io);
		expect(outcome.action).toBe('refused');
		expect(io.files['/workspace/scripts/legacy-bridge/mcp-vertex']).toBe(
			foreign,
		);
	});

	it('removeDirectory on a missing directory reports `unchanged`', async () => {
		const io = ioOver({});
		const outcome = await removeBridgeDirectory(POSIX, io);
		expect(outcome.action).toBe('unchanged');
		expect(outcome.perShim.every((p) => p.action === 'unchanged')).toBe(
			true,
		);
	});
});

describe('Windows install (b00239 S3 smoke)', () => {
	it('writes both .cmd and .ps1 in one call', async () => {
		const io = ioOver({});
		const outcome = await installBridgeDirectory(WINDOWS, io);
		expect(outcome.action).toBe('created');
		expect(
			io.files['/workspace/scripts/legacy-bridge/mcp-vertex.cmd'],
		).toBeDefined();
		expect(
			io.files['/workspace/scripts/legacy-bridge/mcp-vertex.ps1'],
		).toBeDefined();
		expect(
			io.files['/workspace/scripts/legacy-bridge/mcpv.cmd'],
		).toBeDefined();
		expect(
			io.files['/workspace/scripts/legacy-bridge/mcpv.ps1'],
		).toBeDefined();
		// CRLF on .cmd body matters for cmd.exe; the README / .ps1 stay LF.
		expect(
			io.files['/workspace/scripts/legacy-bridge/mcp-vertex.cmd'],
		).toContain('\r\n');
		expect(
			io.files['/workspace/scripts/legacy-bridge/mcp-vertex.ps1'],
		).not.toContain('\r\n');
	});
});

describe('regression — template iterator is exhaustive', () => {
	// Belt-and-braces: a future contributor adds a fourth legacy name
	// to BRIDGE_LEGACY_BINARIES but forgets to update the template
	// helpers. The test list explicitly checks every entry produces a
	// non-empty body so that failure mode is caught at unit-test time,
	// not at user-`bridge install`-time.
	it.each(DEFAULT_BRIDGE_LEGACY_BINARIES)(
		'%s produces a non-empty body on every platform',
		(name: IBridgeLegacyBinary) => {
			for (const env of [POSIX, WINDOWS]) {
				const raws = renderBridgeShim(name, env);
				expect(raws.length).toBeGreaterThan(0);
				for (const raw of raws) {
					expect(raw.body.length).toBeGreaterThan(0);
				}
			}
		},
	);
});
