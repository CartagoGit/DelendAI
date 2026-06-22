import { describe, expect, it } from 'vitest';

import { componentCss } from '../../src/components/styles.css';

describe('componentCss', () => {
	it('is a non-empty CSS string', () => {
		expect(componentCss.length).toBeGreaterThan(200);
	});

	it('covers the five component primitives', () => {
		expect(componentCss).toContain('.mv-header');
		expect(componentCss).toContain('.mv-dropdown');
		expect(componentCss).toContain('.mv-disclosure');
		expect(componentCss).toContain('.mv-lang-picker');
		expect(componentCss).toContain('.mv-toast');
	});

	it('honors prefers-reduced-motion', () => {
		expect(componentCss).toContain('prefers-reduced-motion');
	});

	it('uses the shared --mv-transition tokens', () => {
		// The transition shorthand should reference the shared token (with or
		// without a fallback). The literal `var(--mv-transition-base, …)` is
		// the expected form because it gives older browsers a hard-coded
		// fallback that the brand token overrides.
		expect(componentCss).toMatch(/var\(--mv-transition-base/);
		// It should NOT define its own `--mv-transition-*` (only the tokens
		// file owns those definitions).
		expect(componentCss).not.toMatch(/--mv-transition-(fast|base):/);
	});
});
