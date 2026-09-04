import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FIRST_PARTY_SCOPE } from '@delendai/core/lib/contracts/constants/first-party-scope.constant';
import {
	classifyOrigin,
	isFirstPartySpecifier,
} from '@delendai/core/lib/plugins/classify-origin';

describe('classifyOrigin (f00107 S1 — plugin origin taxonomy)', () => {
	it('classifies a first-party @delendai/* specifier as bundled', () => {
		expect(
			classifyOrigin({
				name: 'proposals',
				resolvedSpecifier: '@delendai/proposals',
			}),
		).toBe('bundled');
	});

	it('classifies a third-party package (mcp-* / bare) as user-local', () => {
		expect(
			classifyOrigin({ name: 'acme', resolvedSpecifier: 'mcp-acme' }),
		).toBe('user-local');
		expect(
			classifyOrigin({ name: 'acme', resolvedSpecifier: 'acme' }),
		).toBe('user-local');
	});

	it('classifies an explicit path entry as user-local (the user owns it)', () => {
		expect(
			classifyOrigin({
				name: 'my-plugin',
				resolvedSpecifier: '/abs/path/plugin.js',
				hasExplicitPath: true,
			}),
		).toBe('user-local');
	});

	it('path precedence: a path wins even if it sits under the scope', () => {
		expect(
			classifyOrigin({
				name: 'proposals',
				resolvedSpecifier: '@delendai/proposals',
				hasExplicitPath: true,
			}),
		).toBe('user-local');
	});

	it('classifies an external-mcps composed server as external', () => {
		expect(
			classifyOrigin({
				name: 'ext.filesystem',
				resolvedSpecifier: 'ext.filesystem',
				isExternalServer: true,
			}),
		).toBe('external');
	});

	it('external precedence beats scope + path', () => {
		expect(
			classifyOrigin({
				name: 'ext.x',
				resolvedSpecifier: '@delendai/whatever',
				hasExplicitPath: true,
				isExternalServer: true,
			}),
		).toBe('external');
	});

	it('isFirstPartySpecifier matches only the scope', () => {
		expect(isFirstPartySpecifier(`${FIRST_PARTY_SCOPE}memory`)).toBe(true);
		expect(isFirstPartySpecifier('mcp-memory')).toBe(false);
	});

	// Drift guard: reuse the filesystem truth (the plugins/ dirs) instead of
	// hardcoding a list. Every shipped plugin, addressed by its scoped
	// specifier, must classify as bundled — so the scope convention and the
	// shipped set can never disagree.
	it('every shipped plugin classifies as bundled via its scoped specifier', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const pluginsDir = join(here, '../../../../../../plugins');
		const dirs = readdirSync(pluginsDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name);
		expect(dirs.length).toBeGreaterThan(0);
		for (const name of dirs) {
			expect(
				classifyOrigin({
					name,
					resolvedSpecifier: `${FIRST_PARTY_SCOPE}${name}`,
				}),
			).toBe('bundled');
		}
	});
});
