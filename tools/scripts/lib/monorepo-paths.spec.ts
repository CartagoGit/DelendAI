#!/usr/bin/env bun
/**
 * monorepo-paths.spec.ts — invariants of the monorepo build / dist
 * layout. These tests are the contract that lets new plugins / apps /
 * packages adopt the layout without having to memorise path names:
 * if a helper changes, this test fails.
 */
import { describe, expect, it } from 'vitest';
import { join, sep } from 'node:path';
import {
	buildDir,
	buildTopLevel,
	distArtifactPath,
	distVersionDir,
	isSafeGroup,
	isSafeName,
	packageBuildDir,
	readJSON,
	relativeFrom,
	repoRoot,
	WELL_KNOWN,
} from './monorepo-paths.ts';

describe('monorepo-paths', async () => {
	describe('repoRoot', async () => {
		it('returns a non-empty absolute path', async () => {
			const root = repoRoot();
			expect(root.length).toBeGreaterThan(0);
			expect(root.startsWith(sep) || root.startsWith('/')).toBe(true);
		});

		it('ends at a directory that contains a package.json', async () => {
			const root = repoRoot();
			expect(readJSON(join(root, 'package.json'))).toBeTypeOf('object');
		});
	});

	describe('packageBuildDir', async () => {
		it('places per-package dist under <group>/<name>/dist', async () => {
			const dir = packageBuildDir('plugins', 'memory');
			expect(dir).toBe(`${repoRoot()}/plugins/memory/dist`);
		});

		it('rejects traversal in the name', async () => {
			expect(() => packageBuildDir('apps', '../etc')).toThrow();
			expect(() => packageBuildDir('apps', 'foo/bar')).toThrow();
		});

		it('rejects uppercase (typo guard)', async () => {
			expect(() => packageBuildDir('apps', 'Web')).toThrow();
		});

		it('rejects unknown groups', async () => {
			expect(() => packageBuildDir('toolz' as never, 'x')).toThrow();
		});
	});

	describe('buildDir', async () => {
		it('places monorepo build under build/<group>/<name>', async () => {
			expect(buildDir('apps', 'web')).toBe(
				`${repoRoot()}/build/apps/web`,
			);
		});
	});

	describe('buildTopLevel', async () => {
		it('places top-level tooling output under build/<name>', async () => {
			expect(buildTopLevel('docs-api')).toBe(
				`${repoRoot()}/build/docs-api`,
			);
		});

		it('rejects names with slashes', async () => {
			expect(() => buildTopLevel('docs/api')).toThrow();
		});
	});

	describe('distVersionDir', async () => {
		it('includes the version verbatim in the path', async () => {
			expect(distVersionDir('extensions', 'vscode', '0.2.0')).toBe(
				`${repoRoot()}/dist/extensions/vscode/0.2.0`,
			);
		});

		it('rejects empty versions', async () => {
			expect(() => distVersionDir('apps', 'vscode', '')).toThrow();
		});

		it('rejects versions with path traversal', async () => {
			expect(() => distVersionDir('apps', 'vscode', '../etc')).toThrow();
		});
	});

	describe('distArtifactPath', async () => {
		it('joins the version dir and the artifact', async () => {
			const out = distArtifactPath(
				'extensions',
				'vscode',
				'0.2.0',
				'x.vsix',
			);
			expect(out).toBe(
				`${repoRoot()}/dist/extensions/vscode/0.2.0/x.vsix`,
			);
		});

		it('rejects artifacts with slashes', async () => {
			expect(() =>
				distArtifactPath('apps', 'vscode', '0.2.0', '../x.vsix'),
			).toThrow();
			expect(() =>
				distArtifactPath('apps', 'vscode', '0.2.0', 'sub/x.vsix'),
			).toThrow();
		});
	});

	describe('WELL_KNOWN', async () => {
		it('docsApi lives at build/docs-api', async () => {
			expect(WELL_KNOWN.docsApi()).toBe(`${repoRoot()}/build/docs-api`);
		});

		it('webApp lives at build/apps/web', async () => {
			expect(WELL_KNOWN.webApp()).toBe(`${repoRoot()}/build/apps/web`);
		});

		it('vscode lives at build/extensions/vscode', async () => {
			expect(WELL_KNOWN.vscode()).toBe(
				`${repoRoot()}/build/extensions/vscode`,
			);
		});

		it('vscodeVsix is rooted under dist/extensions/vscode/<version>', async () => {
			expect(WELL_KNOWN.vscodeVsix('0.2.0')).toBe(
				`${repoRoot()}/dist/extensions/vscode/0.2.0/mcp-vertex-vscode-0.2.0.vsix`,
			);
		});
	});

	describe('isSafeName', async () => {
		it.each([
			['web', true],
			['vscode', true],
			['my-plugin', true],
			['plugin.deprecated', true],
			['x', true],
			['Web', false],
			['.hidden', false],
			['../foo', false],
			['a/b', false],
			['a\\b', false],
			['', false],
		])('isSafeName(%j) === %j', (name, expected) => {
			expect(isSafeName(name)).toBe(expected);
		});
	});

	describe('isSafeGroup', async () => {
		it.each([
			['apps', true],
			['plugins', true],
			['packages', true],
			['examples', false],
			['toolz', false],
			['APPS', false],
		])('isSafeGroup(%j) === %j', (group, expected) => {
			expect(isSafeGroup(group)).toBe(expected);
		});
	});

	describe('relativeFrom', async () => {
		const root = repoRoot();

		it('climbs correctly from apps/web/public/api to build/docs-api', async () => {
			const link = `${root}/apps/web/public/api`;
			const target = `${root}/build/docs-api`;
			const rel = relativeFrom(link, target);
			// `readlink -f $link/$rel` should resolve to $target.
			const resolved = join(link, '..', rel);
			expect(resolved).toBe(target);
		});

		it('returns the climb path when the target IS the repo root', async () => {
			const link = `${root}/apps/web/public/api`;
			// From the symlink's PARENT (apps/web/public), three `..` bring
			// us to the repo root.
			expect(relativeFrom(link, root)).toBe('../../..');
		});

		it("returns '.' when the link itself IS at the repo root", async () => {
			expect(relativeFrom(`${root}/api`, root)).toBe('.');
		});

		it('falls back to the absolute target when it lives outside the repo', async () => {
			const link = `${root}/apps/web/public/api`;
			expect(relativeFrom(link, '/tmp/external')).toBe('/tmp/external');
		});
	});

	describe('readJSON', async () => {
		it("parses the repo's own package.json", async () => {
			const root = repoRoot();
			const pkg = readJSON<{ name: string }>(join(root, 'package.json'));
			expect(pkg.name).toBe('@mcp-vertex/core-monorepo');
		});

		it('throws with a path-qualified message on missing files', async () => {
			expect(() => readJSON('/no/such/file.json')).toThrow(
				/Could not read JSON at/,
			);
		});
	});
});
