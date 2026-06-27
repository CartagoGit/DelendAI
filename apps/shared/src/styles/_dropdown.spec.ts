import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * f00055 / S2 — `apps/shared/src/styles/_dropdown.spec.ts`
 *
 * Contract assertions for the `mv-dropdown__*` component styles
 * shipped under `@mcp-vertex/shared/styles`.
 *
 * These are *text* assertions over the raw SCSS files. We deliberately
 * do not compile the SCSS (no sass runtime needed) — the contract the
 * downstream hosts depend on is "the partial exists, is forwarded by
 * `styles.scss`, and contains the expected class selectors + the
 * open-state rule". A sass-compile check would belong in a visual
 * snapshot suite and is out of scope here.
 *
 * Single Responsibility: this file is the *only* place that locks
 * the public surface of the shared dropdown styles. If the partial
 * stops being `@forward`ed or any of the seven classes disappears,
 * the lint surfaces it here without dragging the full Astro build
 * into the hot path.
 */

const here = dirname(fileURLToPath(import.meta.url));
const stylesRoot = here; // spec sits next to the partials
const partialPath = join(stylesRoot, '_dropdown.scss');
const indexPath = join(stylesRoot, 'styles.scss');

const readText = async (p: string): Promise<string> => {
	try {
		return await readFile(p, 'utf8');
	} catch (cause) {
		throw new Error(
			`_dropdown.spec.ts: cannot read ${p}: ${String(cause)}`,
		);
	}
};

const SEVEN_CLASS_SELECTORS = [
	'.mv-dropdown',
	'.mv-dropdown__trigger',
	'.mv-dropdown__menu',
	'.mv-dropdown__menu--left',
	'.mv-dropdown__menu--right',
	'.mv-dropdown__item',
	'.mv-dropdown__label',
	'.mv-dropdown__icon',
	'.mv-dropdown__caret',
] as const;

describe('f00055 S2 — shared dropdown styles (@mcp-vertex/shared/styles)', () => {
	it('ships the partial at apps/shared/src/styles/_dropdown.scss', async () => {
		const partial = await readText(partialPath);
		expect(partial.length).toBeGreaterThan(0);
	});

	it('is @forwarded by apps/shared/src/styles/styles.scss', async () => {
		const index = await readText(indexPath);
		// Token-level: exactly the line that brings the partial into
		// the public surface. Whitespace-tolerant so a future
		// formatter reflow does not break the assertion.
		expect(index).toMatch(/@forward\s+['"]dropdown['"]/);
	});

	it('contains every required BEM class selector', async () => {
		const partial = await readText(partialPath);
		for (const selector of SEVEN_CLASS_SELECTORS) {
			// We assert the selector appears *as a selector*, not as
			// part of a longer identifier (e.g. we don't want a stray
			// `.mv-dropdown__trigger--foo` to satisfy the bare
			// `.mv-dropdown__trigger` check). A word-boundary-like
			// check on both sides covers that without pulling in a
			// CSS parser.
			const escaped = selector.replace(/\./g, '\\.');
			const re = new RegExp(`${escaped}(\\s|\\{|,|:)`);
			expect(
				partial.match(re),
				`expected selector ${selector} to appear as a CSS selector in _dropdown.scss`,
			).not.toBeNull();
		}
	});

	it('defines the open-state rule tied to [aria-expanded="true"]', async () => {
		const partial = await readText(partialPath);
		// The runtime sets `aria-expanded="true"` on the trigger when
		// the panel opens. The visual open-state MUST be expressed as
		// a CSS rule under `[aria-expanded='true']` (or the
		// double-quoted equivalent) so the JS contract is narrow —
		// the runtime only flips the attribute, never the visibility.
		expect(partial).toMatch(/\[aria-expanded=['"]true['"]\]/);
	});

	it('honors `prefers-reduced-motion` (open/close transition collapses to 0ms)', async () => {
		const partial = await readText(partialPath);
		expect(partial).toContain('@media (prefers-reduced-motion: reduce)');
		// The motion-collapse block must apply to the menu (the surface
		// with the visible transform/opacity transition).
		const reduced = partial.match(
			/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/,
		);
		expect(
			reduced,
			'prefers-reduced-motion block must be present',
		).not.toBeNull();
		expect(reduced?.[1] ?? '').toMatch(/\.mv-dropdown__menu/);
	});

	it('uses the shared `--mv-transition-*` tokens (no hardcoded ms values)', async () => {
		const partial = await readText(partialPath);
		// The transition cadence is owned by the tokens layer
		// (`_tokens.scss`). The partial must read it from there so a
		// future token bump propagates automatically.
		expect(partial).toContain('var(--mv-transition-fast)');
		expect(partial).toContain('var(--mv-transition-base)');
		// Hardcoded `transition: …ms` literals would bypass the
		// token layer. We forbid them in the component partial.
		expect(partial).not.toMatch(/transition:\s*\d+m?s\s/);
	});
});
