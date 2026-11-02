import { describe, expect, it } from 'vitest';

import { componentCss } from '../../src/components/styles.css';

describe('componentCss', async () => {
	it('is a non-empty CSS string', async () => {
		expect(componentCss.length).toBeGreaterThan(200);
	});

	it('covers the five component primitives', async () => {
		expect(componentCss).toContain('.delendai-header');
		expect(componentCss).toContain('.delendai-dropdown');
		expect(componentCss).toContain('.delendai-disclosure');
		expect(componentCss).toContain('.delendai-lang-picker');
		expect(componentCss).toContain('.delendai-toast');
	});

	it('honors prefers-reduced-motion', async () => {
		expect(componentCss).toContain('prefers-reduced-motion');
	});

	it('uses the shared --delendai-transition tokens', async () => {
		// The transition shorthand should reference the shared token (with or
		// without a fallback). The literal `var(--delendai-transition-base, …)` is
		// the expected form because it gives older browsers a hard-coded
		// fallback that the brand token overrides.
		expect(componentCss).toMatch(/var\(--delendai-transition-base/);
		// It should NOT define its own `--delendai-transition-*` (only the tokens
		// file owns those definitions).
		expect(componentCss).not.toMatch(/--delendai-transition-(fast|base):/);
	});
});
