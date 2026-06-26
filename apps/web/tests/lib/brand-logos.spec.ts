import { describe, expect, it } from 'vitest';

import {
	KIND_PREFIX,
	brandLogo,
	brandLogosInventory,
	type LogoKind,
} from '../../src/lib/brand-logos';

/**
 * `brand-logos.ts` is the single resolver every Astro component
 * reaches for (f00069 S5). These specs pin the six kinds and the
 * known brand marks; adding a new kind is one `KIND_PREFIX` entry
 * plus a spec line, not a refactor.
 */
describe('brand-logos', () => {
	describe('KIND_PREFIX', () => {
		it('covers all six kinds', () => {
			const expected: ReadonlyArray<LogoKind> = [
				'pm',
				'ide',
				'plugin',
				'lang',
				'section',
				'lib',
			];
			for (const k of expected) {
				expect(KIND_PREFIX[k]).toBeTypeOf('string');
			}
			// `Record<LogoKind, string>` enforces this at compile time;
			// the runtime check guards against drift if someone widens
			// the union without touching the map.
			expect(Object.keys(KIND_PREFIX).sort()).toEqual(
				[...expected].sort(),
			);
		});

		it('uses the documented prefix per kind', () => {
			expect(KIND_PREFIX.pm).toBe('');
			expect(KIND_PREFIX.ide).toBe('ide-');
			expect(KIND_PREFIX.plugin).toBe('plugin-');
			expect(KIND_PREFIX.lang).toBe('lang-');
			expect(KIND_PREFIX.section).toBe('section-');
			expect(KIND_PREFIX.lib).toBe('');
		});
	});

	describe('brandLogo — package managers (kind: pm)', () => {
		const ids = ['npm', 'pnpm', 'yarn', 'bun', 'deno'];
		for (const id of ids) {
			it(`resolves ${id}`, () => {
				const url = brandLogo(id, 'pm');
				expect(url).toBeTruthy();
				expect(url).toMatch(
					new RegExp(`^/logos/${id}\\.(svg|png|ico)$`),
				);
			});
		}
	});

	describe('brandLogo — IDEs (kind: ide)', () => {
		const ids = [
			'vscode',
			'cursor',
			'windsurf',
			'zed',
			'antigravity',
			'claude-code',
			'claude-desktop',
		];
		for (const id of ids) {
			it(`resolves ${id}`, () => {
				const url = brandLogo(id, 'ide');
				expect(url).toBeTruthy();
				expect(url).toMatch(
					new RegExp(`^/logos/ide-${id}\\.(svg|png|ico)$`),
				);
			});
		}
	});

	describe('brandLogo — plugins (kind: plugin)', () => {
		const slugs = [
			'proposals',
			'memory',
			'quality',
			'search',
			'rules',
			'docs',
			'deps',
			'notification',
			'logs',
			'status-marker',
			'git',
			'issues',
			'conventions',
			'audit',
			'test-convention',
			'web-fetch',
		];
		for (const slug of slugs) {
			it(`resolves plugin-${slug}`, () => {
				const url = brandLogo(slug, 'plugin');
				expect(url).toBeTruthy();
				expect(url).toBe(`/logos/plugin-${slug}.svg`);
			});
		}
	});

	describe('brandLogo — negative paths', () => {
		it('returns null for a missing pm id (does not throw)', () => {
			expect(brandLogo('nonexistent', 'pm')).toBeNull();
		});

		it('returns null for a missing plugin slug', () => {
			expect(brandLogo('nonexistent', 'plugin')).toBeNull();
		});

		it('returns null for lang kinds that have no files yet', () => {
			// The `lang` kind exists in the union but no `lang-*.svg|png|ico`
			// has been published; the resolver must return null cleanly.
			expect(brandLogo('vue', 'lang')).toBeNull();
			expect(brandLogo('typescript', 'lang')).toBeNull();
		});

		it('returns null for section kinds that have no files yet', () => {
			expect(brandLogo('plugins', 'section')).toBeNull();
			expect(brandLogo('tools', 'section')).toBeNull();
		});

		it('defaults to kind=pm when omitted', () => {
			expect(brandLogo('npm')).toBe('/logos/npm.svg');
		});

		it('distinguishes between kinds for the same id', () => {
			// `git` exists as a bare `git.svg` (kind=lib) AND as
			// `plugin-git.svg` (kind=plugin). The resolver must pick
			// based on kind, not "first match wins".
			expect(brandLogo('git', 'lib')).toBe('/logos/git.svg');
			expect(brandLogo('git', 'plugin')).toBe('/logos/plugin-git.svg');
		});

		it('resolves every unprefixed lib mark', () => {
			expect(brandLogo('github', 'lib')).toBe('/logos/github.png');
			expect(brandLogo('node', 'lib')).toBe('/logos/node.png');
			expect(brandLogo('typescript', 'lib')).toBe(
				'/logos/typescript.png',
			);
			expect(brandLogo('git', 'lib')).toBe('/logos/git.svg');
			expect(brandLogo('modelcontextprotocol', 'lib')).toBe(
				'/logos/modelcontextprotocol.png',
			);
		});
	});

	describe('brandLogosInventory', () => {
		it('lists every file under public/logos/ except .gitkeep', () => {
			const inventory = brandLogosInventory();
			expect(inventory.length).toBeGreaterThanOrEqual(43);
			expect(
				inventory.find((i) => i.file === '.gitkeep'),
			).toBeUndefined();
			// Every entry has a known extension.
			for (const item of inventory) {
				expect(['svg', 'png', 'ico', 'other']).toContain(item.ext);
			}
		});

		it('is sorted alphabetically by filename', () => {
			const inventory = brandLogosInventory();
			const files = inventory.map((i) => i.file);
			const sorted = [...files].sort((a, b) => a.localeCompare(b));
			expect(files).toEqual(sorted);
		});
	});
});
