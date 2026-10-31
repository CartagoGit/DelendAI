import { describe, expect, it } from 'vitest';

import {
	architectureFor,
	directiveSupported,
	layerOf,
	majorOf,
	ownerOfSelector,
	resolveStyleProfile,
} from '../../../../src/lib/profile/style-profile.service';

const profile = resolveStyleProfile({
	architecture: 'scss-bem',
	overrides: [
		{ glob: 'src/legacy/**', architecture: 'legacy-global' },
		{ glob: 'src/legacy/new/**', architecture: 'tailwind' },
	],
	layers: [
		{
			name: 'shared',
			glob: 'apps/shared/**',
			prefixes: ['ui-', 'ui-card-'],
		},
		{ name: 'site', glob: 'apps/web/**', prefixes: ['page-'] },
	],
});

describe('resolveStyleProfile', () => {
	it('fills in what a project did not declare', () => {
		const empty = resolveStyleProfile({});
		expect(empty.architecture).toBe('scss-bem');
		expect(empty.overrides).toEqual([]);
		expect(empty.layers).toEqual([]);
		expect(empty.styleRoots).toEqual([]);
	});
});

describe('architectureFor', () => {
	it('is the default where no override matches', () => {
		expect(architectureFor(profile, 'src/app/a.scss')).toBe('scss-bem');
	});

	it('is the folder override, and the last one that matches wins', () => {
		expect(architectureFor(profile, 'src/legacy/old.css')).toBe(
			'legacy-global',
		);
		expect(architectureFor(profile, 'src/legacy/new/a.css')).toBe(
			'tailwind',
		);
	});
});

describe('layers and ownership', () => {
	it('places a file in the first layer whose glob matches', () => {
		expect(layerOf(profile, 'apps/web/src/a.scss')).toBe('site');
		expect(layerOf(profile, 'tools/x.scss')).toBeUndefined();
	});

	it('gives a selector to the layer with the longest matching prefix', () => {
		expect(ownerOfSelector(profile, 'ui-card-title')).toBe('shared');
		expect(ownerOfSelector(profile, 'page-hero')).toBe('site');
		expect(ownerOfSelector(profile, 'misc')).toBeUndefined();
	});
});

describe('directiveSupported', () => {
	it('follows the installed major', () => {
		expect(directiveSupported('utility', 4)).toBe(true);
		expect(directiveSupported('utility', 3)).toBe(false);
		expect(directiveSupported('tailwind', 3)).toBe(true);
		expect(directiveSupported('tailwind', 4)).toBe(false);
		expect(directiveSupported('apply', 3)).toBe(true);
	});

	it('cannot say for a directive it does not know or with nothing installed', () => {
		expect(directiveSupported('media', 4)).toBeUndefined();
		expect(directiveSupported('utility', undefined)).toBeUndefined();
	});

	it('reads the major out of a version or a range', () => {
		expect(majorOf('4.1.3')).toBe(4);
		expect(majorOf('^3.4.0')).toBe(3);
		expect(majorOf(undefined)).toBeUndefined();
		expect(majorOf('latest')).toBeUndefined();
	});
});
