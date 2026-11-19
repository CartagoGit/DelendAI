import { describe, expect, it } from 'vitest';

import {
	checkStyle,
	designTokensOf,
} from '../../../../src/lib/check/style-check.service';
import { buildSelectorGraph } from '../../../../src/lib/graph/selector-graph.service';
import { resolveStyleProfile } from '../../../../src/lib/profile/style-profile.service';

const TOKENS = {
	path: 'apps/shared/src/styles/tokens.scss',
	text: ':root {\n\t--color-primary: #2563EB;\n\t--space: 0;\n}\n$radius: 6px;\n',
};

const profile = resolveStyleProfile({
	overrides: [
		{ glob: 'apps/web/src/legacy/**', architecture: 'legacy-global' },
		{ glob: 'apps/web/src/tw/**', architecture: 'tailwind' },
	],
	layers: [
		{ name: 'shared', glob: 'apps/shared/**', prefixes: ['ui-'] },
		{ name: 'site', glob: 'apps/web/**', prefixes: ['page-'] },
	],
	sharedPrefixes: ['brand-'],
	sharedAuthority: 'lint:shared-ui-ratchet',
});

const graph = buildSelectorGraph({
	stylesheets: [
		{
			path: 'apps/shared/src/styles/ui.scss',
			text: '.ui-button { color: red; }\n.brand-logo { width: 10px; }\n.card { margin: 0; }\n',
		},
	],
	markup: [],
});

const tokens = designTokensOf(TOKENS);

const check = (path: string, text: string, utilityMajor?: number) =>
	checkStyle({ profile, graph, tokens, edit: { path, text }, utilityMajor });

describe('designTokensOf', () => {
	it('reads CSS custom properties and SCSS variables, and nothing else', () => {
		expect(tokens.map((token) => token.name)).toEqual([
			'--color-primary',
			'--space',
			'$radius',
		]);
		expect(tokens[0]).toEqual({
			name: '--color-primary',
			value: '#2563EB',
			file: TOKENS.path,
		});
	});
});

describe('checkStyle', () => {
	it('refuses a hard-coded value an existing design token names, and names the token', () => {
		const [finding] = check(
			'apps/web/src/styles/hero.scss',
			'.page-hero {\n\tcolor: #2563eb;\n}\n',
		);
		expect(finding?.kind).toBe('literal-has-token');
		expect(finding?.line).toBe(2);
		expect(finding?.message).toContain('--color-primary');
		expect(finding?.remedy).toContain('var(--color-primary)');
	});

	it('names an SCSS variable as itself, and ignores values too short to be worth a token', () => {
		const findings = check(
			'apps/web/src/styles/hero.scss',
			'.page-hero {\n\tborder-radius: 6px;\n\tmargin: 0;\n}\n',
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.remedy).toContain('Use $radius');
	});

	it('does not flag the token file declaring its own tokens', () => {
		expect(check(TOKENS.path, TOKENS.text)).toEqual([]);
	});

	it('refuses a selector another layer owns', () => {
		const [finding] = check(
			'apps/web/src/styles/hero.scss',
			'.ui-badge { color: red; }\n',
		);
		expect(finding?.kind).toBe('foreign-selector');
		expect(finding?.message).toContain('belongs to the shared layer');
	});

	it('refuses a second definition of a selector defined elsewhere', () => {
		const [finding] = check(
			'apps/web/src/styles/hero.scss',
			'.card { padding: 1px; }\n',
		);
		expect(finding?.kind).toBe('forked-selector');
		expect(finding?.message).toContain('apps/shared/src/styles/ui.scss');
	});

	it('hands a shared class to the gate that owns it instead of deciding', () => {
		const [finding] = check(
			'apps/web/src/styles/hero.scss',
			'.brand-logo { width: 12px; }\n',
		);
		expect(finding?.kind).toBe('shared-owned');
		expect(finding?.remedy).toContain('lint:shared-ui-ratchet');
		// Defining a shared class for the first time is not this check's either.
		expect(
			check(
				'apps/web/src/styles/hero.scss',
				'.brand-new { width: 1px; }\n',
			),
		).toEqual([]);
	});

	it('accepts the file that holds a definition changing it', () => {
		expect(
			check(
				'apps/shared/src/styles/ui.scss',
				'.ui-button { color: green; }\n.card { margin: 1px; }\n',
			),
		).toEqual([]);
	});

	it('gives a folder declared legacy-global no finding at all', () => {
		expect(
			check(
				'apps/web/src/legacy/old.css',
				'.ui-badge { color: #2563eb; }\n.card { margin: 0; }\n',
			),
		).toEqual([]);
	});

	it('refuses a directive the installed version does not accept, under tailwind only', () => {
		const sheet = '@utility tab-4 {\n\ttab-size: 4;\n}\n';
		const [finding] = check('apps/web/src/tw/a.css', sheet, 3);
		expect(finding?.kind).toBe('unsupported-directive');
		expect(finding?.line).toBe(1);
		expect(check('apps/web/src/tw/a.css', sheet, 4)).toEqual([]);
		expect(check('apps/web/src/tw/a.css', sheet)).toEqual([]);
		expect(check('apps/web/src/styles/a.css', sheet, 3)).toEqual([]);
	});
});
