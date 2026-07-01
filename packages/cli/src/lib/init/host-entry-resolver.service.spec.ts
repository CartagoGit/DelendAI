/**
 * host-entry-resolver.spec.ts — f00088 S2.
 *
 * Exercises every resolution branch against a fake `IPathProbe`
 * so the test is deterministic and doesn't touch the disk.
 */
import { describe, expect, it } from 'vitest';

import {
	HostEntryNotFoundError,
	resolveHostEntryPath,
	type IPathProbe,
} from './host-entry-resolver.service';

const probeWith = (existing: ReadonlySet<string>): IPathProbe => ({
	exists: (path) => existing.has(path),
});

describe('resolveHostEntryPath (f00088 S2)', () => {
	it('honours the explicit override when set and the file exists', () => {
		const probe = probeWith(new Set(['/opt/mcp-vertex/host.ts']));
		const resolved = resolveHostEntryPath('/workspace', {
			explicitRoot: '/opt/mcp-vertex/host.ts',
			probe,
		});
		expect(resolved.path).toBe('/opt/mcp-vertex/host.ts');
		expect(resolved.source).toBe('flag');
	});

	it('falls through to node_modules/@mcp-vertex/core/tools/scripts/host', () => {
		const probe = probeWith(
			new Set([
				'/workspace/node_modules/@mcp-vertex/core/tools/scripts/host/host-server.script.ts',
			]),
		);
		const resolved = resolveHostEntryPath('/workspace', { probe });
		expect(resolved.source).toBe('node_modules');
		expect(resolved.path).toBe(
			'/workspace/node_modules/@mcp-vertex/core/tools/scripts/host/host-server.script.ts',
		);
	});

	it('falls back to npm dist when the script-style entry is missing', () => {
		const probe = probeWith(
			new Set([
				'/workspace/node_modules/@mcp-vertex/core/dist/host/host-server.js',
			]),
		);
		const resolved = resolveHostEntryPath('/workspace', { probe });
		expect(resolved.source).toBe('npm_dist');
	});

	it('falls back to ../mcp-vertex/ sibling checkout', () => {
		const probe = probeWith(
			new Set(['/mcp-vertex/tools/scripts/host/host-server.script.ts']),
		);
		const resolved = resolveHostEntryPath('/workspace', { probe });
		expect(resolved.source).toBe('sibling');
		expect(resolved.path).toBe(
			'/mcp-vertex/tools/scripts/host/host-server.script.ts',
		);
	});

	it('falls back to ../mcp-vertex-core/ alternate sibling name', () => {
		const probe = probeWith(
			new Set([
				'/mcp-vertex-core/tools/scripts/host/host-server.script.ts',
			]),
		);
		const resolved = resolveHostEntryPath('/workspace', { probe });
		expect(resolved.source).toBe('sibling_alt');
		expect(resolved.path).toBe(
			'/mcp-vertex-core/tools/scripts/host/host-server.script.ts',
		);
	});

	it("falls back to ../propios/mcp-vertex/ (operator's nested layout, f00103)", () => {
		const probe = probeWith(
			new Set([
				'/propios/mcp-vertex/tools/scripts/host/host-server.script.ts',
			]),
		);
		const resolved = resolveHostEntryPath('/workspace', { probe });
		expect(resolved.source).toBe('sibling_nested');
		expect(resolved.path).toBe(
			'/propios/mcp-vertex/tools/scripts/host/host-server.script.ts',
		);
	});

	it('recovers via sibling_walk when the checkout lives at an irregular path (f00103)', () => {
		// The walk is the last-resort branch. It only fires when none
		// of the explicit candidates match. Workspace lives at
		// `/parent/workspace` and the mcp-vertex checkout lives at
		// `/parent/worktrees/mcp-vertex` — neither the canonical
		// `../mcp-vertex/` nor `../mcp-vertex-core/` nor
		// `../propios/mcp-vertex/` candidates exist, so the
		// walk-up finds the entry at the irregular path.
		const entry =
			'/parent/worktrees/mcp-vertex/tools/scripts/host/host-server.script.ts';
		const probe: IPathProbe = {
			exists: (p) => p === entry,
			// The walk enumerates the parent of the workspace and then
			// descends one level into its children. `worktrees` does
			// not contain `mcp-vertex` itself — but its child
			// `mcp-vertex` does, so the depth-2 walk finds it.
			readDirNames: (dir) => {
				if (dir === '/parent')
					return ['workspace', 'worktrees', 'README.md'];
				if (dir === '/parent/worktrees') return ['mcp-vertex'];
				return [];
			},
		};
		const resolved = resolveHostEntryPath('/parent/workspace', { probe });
		expect(resolved.source).toBe('sibling_walk');
		expect(resolved.path).toBe(entry);
	});

	it('skips the sibling_walk when readDirNames is not implemented by the probe', () => {
		// A probe that does not expose `readDirNames` (defensive:
		// some host integrations inject a minimal probe) must not
		// crash the resolver — the walk simply yields no match and
		// the typed error surfaces.
		const probe: IPathProbe = {
			exists: () => false,
		};
		expect(() =>
			resolveHostEntryPath('/workspace', { probe }),
		).toThrowError(HostEntryNotFoundError);
	});

	it('throws HostEntryNotFoundError listing every attempt when none match', () => {
		const probe = probeWith(new Set());
		expect(() =>
			resolveHostEntryPath('/workspace', { probe }),
		).toThrowError(HostEntryNotFoundError);
	});

	it('includes the explicit override in the error attempts when it does not exist', () => {
		const probe = probeWith(new Set());
		try {
			resolveHostEntryPath('/workspace', {
				explicitRoot: '/nope/missing.ts',
				probe,
			});
			throw new Error('expected to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(HostEntryNotFoundError);
			const e = error as HostEntryNotFoundError;
			expect(e.attempted).toContain('/nope/missing.ts');
			expect(e.attempted.length).toBeGreaterThan(4);
			expect(e.message).toMatch(/bun add @mcp-vertex\/core/);
		}
	});
});
