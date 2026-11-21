/**
 * Responsive header + marquee contract guard (f00064 S4).
 *
 * There is no Playwright / visual-regression infra in this repo (see the
 * comment in `tabs-cross-fade.spec.ts` — vitest runs in `node` and the house
 * convention for "equivalent visual checks" is a static-source contract spec:
 * read the authored CSS/markup and assert the invariants that make the layout
 * safe at the required widths). This file encodes the two acceptance
 * invariants for S4 so a future edit that reintroduces the overlap fails here
 * instead of only in a browser nobody runs.
 *
 * Acceptance (from the proposal):
 *   - Header content does not overlap at mobile / tablet / laptop / wide
 *     desktop widths (≥ 390px, 768px, 1024px, 1440px).
 *   - The marquee has stable height/spacing and does not clip or collide with
 *     adjacent sections.
 *
 * The invariants that guarantee those, and why:
 *   1. `.nav__inner` uses `min-height` (not a fixed `height`). A fixed height
 *      turns any wrapped nav row into an overflow that overlaps the hero /
 *      page-header below it; `min-height` lets the header grow instead.
 *   2. The desktop row collapses to the hamburger BELOW the tablet band. The
 *      full row (brand + 4 links + "More" + GitHub + search + gear) only fits
 *      from ~820px up, so the collapse breakpoint must sit at/above the 768px
 *      tablet width and below the 1024px laptop width — otherwise 768px renders
 *      the full row, which wraps and overlaps. We assert the breakpoint is in
 *      [768, 1024).
 *   3. The marquee viewport clips on the X axis only (so the wide track never
 *      causes page scroll) WITHOUT a Y-axis clip (which would cut the hover
 *      lift), and tiles seamlessly (`translateX(-50%)`), so it keeps a stable
 *      height and never collides with neighbours.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, rel), 'utf8');

const navScss = read('../../src/styles/components/_nav.scss');
const navMediaScss = read('../../src/styles/components/_nav-media.scss');
const marqueeScss = read('../../src/styles/components/_marquee.scss');

describe('nav header — no-overlap contract (f00064 S4)', () => {
	it('sizes `.nav__inner` with `min-height`, never a fixed `height`', () => {
		// A fixed height clips a wrapped row into the section below it. The
		// header must be allowed to grow, so only `min-height` is permitted.
		const inner = /\.nav__inner\s*\{([\s\S]*?)\}/.exec(navScss);
		expect(inner).not.toBeNull();
		const body = inner?.[1] ?? '';
		expect(body).toMatch(/min-height:/);
		// A bare `height:` (not `min-height:` / `line-height:`) would reintroduce
		// the overflow — reject it.
		expect(body).not.toMatch(/(?<!min-)(?<!line-)height:/);
	});

	it('collapses to the hamburger across the tablet band (breakpoint in [768, 1024))', () => {
		// Find the media query whose block turns the hamburger on.
		const queries = [
			...navMediaScss.matchAll(
				/@media \(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/g,
			),
		];
		const collapse = queries.find(([, , block]) =>
			/\.hamburger\s*\{[\s\S]*?display:\s*inline-grid/.test(block),
		);
		expect(collapse, 'a max-width query must show .hamburger').toBeTruthy();
		const px = Number(collapse?.[1]);
		// 768px (tablet) must fall inside the collapse range, and 1024px
		// (laptop) must stay on the full desktop nav.
		expect(px).toBeGreaterThanOrEqual(768);
		expect(px).toBeLessThan(1024);
	});

	it('hides the horizontal link row in the same collapse query', () => {
		// The links / divider / More / GitHub must be hidden wherever the
		// hamburger is shown, or both would render and overflow.
		const collapse =
			/@media \(max-width:\s*\d+px\)\s*\{([\s\S]*?)\n\}/.exec(
				navMediaScss,
			);
		const block = collapse?.[1] ?? '';
		expect(block).toMatch(/\.nav__link[\s\S]*?display:\s*none/);
		expect(block).toContain('.nav__github');
	});
});

describe('marquee — stable height, no clip/collision (f00064 S4)', () => {
	it('clips the X axis only (no Y clip that would cut the hover lift)', () => {
		const viewport = /\.mq__viewport\s*\{([\s\S]*?)\n\}/.exec(marqueeScss);
		const body = viewport?.[1] ?? '';
		expect(body).toMatch(/overflow-x:\s*(clip|hidden)/);
		// A plain `overflow:` or `overflow-y:` hidden/clip would crop the
		// lifted chip on hover — must not be present.
		expect(body).not.toMatch(/overflow-y:\s*(clip|hidden)/);
		expect(body).not.toMatch(/overflow:\s*(clip|hidden)/);
	});

	it('tiles seamlessly with a -50% translate so the height stays constant', () => {
		// The two duplicated sets + a -50% translate are what make the loop
		// seamless; without them the track would jump and change height.
		expect(marqueeScss).toContain('translateX(-50%)');
		expect(marqueeScss).toMatch(
			/\.mq__track\s*\{[\s\S]*?width:\s*max-content/,
		);
	});
});
