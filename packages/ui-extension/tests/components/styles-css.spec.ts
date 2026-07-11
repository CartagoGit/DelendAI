import { describe, expect, it } from 'vitest';

import { componentCss } from '../../src/components/styles.css';

describe('componentCss', async () => {
	it('is a non-empty CSS string', async () => {
		expect(componentCss.length).toBeGreaterThan(200);
	});

	it('covers the five component primitives', async () => {
		expect(componentCss).toContain('.mcpv-header');
		expect(componentCss).toContain('.mcpv-dropdown');
		expect(componentCss).toContain('.mcpv-disclosure');
		expect(componentCss).toContain('.mcpv-lang-picker');
		expect(componentCss).toContain('.mcpv-toast');
	});

	it('honors prefers-reduced-motion', async () => {
		expect(componentCss).toContain('prefers-reduced-motion');
	});

	it('uses the shared --mcpv-transition tokens', async () => {
		// The transition shorthand should reference the shared token (with or
		// without a fallback). The literal `var(--mcpv-transition-base, …)` is
		// the expected form because it gives older browsers a hard-coded
		// fallback that the brand token overrides.
		expect(componentCss).toMatch(/var\(--mcpv-transition-base/);
		// It should NOT define its own `--mcpv-transition-*` (only the tokens
		// file owns those definitions).
		expect(componentCss).not.toMatch(/--mcpv-transition-(fast|base):/);
	});
});
