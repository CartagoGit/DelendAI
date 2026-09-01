import { describe, expect, it } from 'vitest';

import {
	fileUrlToPath,
	resolvePackageRoot,
} from '@mcp-vertex/core/lib/skills/sources/package-root';

const dirname = (p: string): string => {
	const idx = p.lastIndexOf('/');
	return idx === -1 ? p : p.slice(0, idx);
};

describe('skills/sources/package-root (q00009 / f00263)', () => {
	describe('fileUrlToPath', () => {
		it('strips file:// and decodes percent-encoding', () => {
			expect(fileUrlToPath('file:///foo/bar%20baz/baz')).toBe(
				'/foo/bar baz/baz',
			);
		});

		it('passes non-URL paths through untouched', () => {
			expect(fileUrlToPath('/foo/bar')).toBe('/foo/bar');
		});
	});

	describe('resolvePackageRoot', () => {
		it('walks up to the first package.json', async () => {
			const packageJsonPaths = new Set<string>([
				'/repo/packages/core/package.json',
				'/repo/package.json',
			]);
			const readJson = async (abs: string): Promise<unknown> =>
				packageJsonPaths.has(abs) ? { name: '@mcp-vertex/core' } : null;

			const root = await resolvePackageRoot({
				moduleUrl:
					'file:///repo/packages/core/src/lib/skills/sources/types.ts',
				dirnameFn: dirname,
				readJson,
			});
			expect(root).toBe('/repo/packages/core');
		});

		it('returns null when no package.json is found within the guard', async () => {
			const readJson = async (): Promise<null> => null;
			const root = await resolvePackageRoot({
				moduleUrl: 'file:///foo/bar/baz.ts',
				dirnameFn: dirname,
				readJson,
			});
			expect(root).toBeNull();
		});

		it('walks up to the outer package.json when only one exists', async () => {
			const packageJsonPaths = new Set<string>(['/repo/package.json']);
			const readJson = async (abs: string): Promise<unknown> =>
				packageJsonPaths.has(abs) ? { name: 'repo' } : null;
			const root = await resolvePackageRoot({
				moduleUrl: 'file:///repo/packages/core/src/lib/foo.ts',
				dirnameFn: dirname,
				readJson,
			});
			expect(root).toBe('/repo');
		});

		it('handles installed project paths under node_modules', async () => {
			// Consumer project layout:
			//   /consumer/node_modules/@mcp-vertex/core/package.json
			//   /consumer/node_modules/@mcp-vertex/core/src/lib/skills/...
			const packageJsonPaths = new Set<string>([
				'/consumer/node_modules/@mcp-vertex/core/package.json',
			]);
			const readJson = async (abs: string): Promise<unknown> =>
				packageJsonPaths.has(abs) ? { name: '@mcp-vertex/core' } : null;

			const root = await resolvePackageRoot({
				moduleUrl:
					'file:///consumer/node_modules/@mcp-vertex/core/src/lib/skills/sources/types.ts',
				dirnameFn: dirname,
				readJson,
			});
			expect(root).toBe('/consumer/node_modules/@mcp-vertex/core');
		});
	});
});
