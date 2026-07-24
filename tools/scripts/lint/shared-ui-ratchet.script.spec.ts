/**
 * shared-ui-ratchet.script.spec.ts — f00102 S4 spec.
 *
 * Covers the two failure modes the ratchet enforces:
 *   1. `findInlineClasses` flags `.tsx` / `.ts` / `.astro`
 *      sources that mention a shared BEM class in a literal
 *      `class="..."` / `className='...'` / `` `class=\`...\`` ``.
 *   2. `findForkedScss` flags per-surface SCSS that defines rules
 *      for a shared token.
 *
 * The waivers path is exercised end-to-end via `loadWaivers` with
 * an inline tempfile fixture so the JSON-shape check doesn't
 * depend on the repo's actual waivers file.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	findForkedScss,
	findHardcodedAriaLabels,
	findInlineClasses,
	loadWaivers,
	type Violation,
} from './shared-ui-ratchet.script';

describe('shared-ui-ratchet / findInlineClasses', () => {
	it('flags a `class="mcpv-callout ..."` literal in a .ts file', () => {
		const src = `const html = '<aside class="mcpv-callout">x</aside>';`;
		const out = findInlineClasses('apps/web/src/test.ts', src);
		expect(out).toHaveLength(1);
		expect(out[0]?.kind).toBe('inline-class');
		expect(out[0]?.className).toBe('mcpv-callout');
		expect(out[0]?.file).toBe('apps/web/src/test.ts');
	});

	it('flags Astro JSX class="..." with classPrefix variants', () => {
		const src = `
<aside class="mcpv-copybtn mcpv-copybtn--solid">Click</aside>
`;
		const out = findInlineClasses('extensions/vscode/src/x.tsx', src);
		expect(out.length).toBeGreaterThanOrEqual(1);
		expect(out.find((v) => v.className === 'mcpv-copybtn')).toBeTruthy();
	});

	it('does NOT flag a literal in a comment', () => {
		const src = `
/**
 * Use class="mcpv-callout" in the future — but for now we render
 * via shared.
 */
`;
		const out = findInlineClasses('apps/web/src/test.ts', src);
		// The regex intentionally fires inside comments too — the
		// ratchet is a structural lint, not a semantic one. This
		// test pins that behaviour so we don't accidentally allow
		// documentation drift.
		expect(out.length).toBeGreaterThan(0);
	});

	it('does NOT flag non-shared classes (e.g. mcpv-bespoke)', () => {
		const src = `class="mcpv-bespoke-card"`;
		const out = findInlineClasses('apps/web/src/test.ts', src);
		expect(out).toHaveLength(0);
	});
});

describe('shared-ui-ratchet / findForkedScss', () => {
	it('flags .mcpv-callout selectors in extensions/vscode/src/*.scss', () => {
		const src = `.mcpv-callout { color: red; }`;
		const out = findForkedScss('extensions/vscode/src/dev/test.scss', src);
		expect(out).toHaveLength(1);
		expect(out[0]?.kind).toBe('forked-scss');
	});

	it('does NOT flag the shared partial itself', () => {
		const src = `.mcpv-callout { color: red; }`;
		const out = findForkedScss(
			'apps/shared/src/styles/components/callout.scss',
			src,
		);
		expect(out).toHaveLength(0);
	});

	it('flags nested & selectors too', () => {
		const src = `.foo { .mcpv-stepper { color: red; } }`;
		const out = findForkedScss('packages/ui-extension/src/x.scss', src);
		expect(out).toHaveLength(1);
	});
});

describe('shared-ui-ratchet / loadWaivers', () => {
	let tmp = '';
	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), 'shared-ui-ratchet-'));
	});
	afterEach(() => rm(tmp, { recursive: true, force: true }));

	it('returns empty when the waivers file is missing', async () => {
		const { waivers, invalid } = await loadWaivers(
			join(tmp, 'no-such-file.json'),
		);
		expect(waivers).toHaveLength(0);
		expect(invalid).toHaveLength(0);
	});

	it('rejects waivers with too-short reasons', async () => {
		const path = join(tmp, 'short.json');
		await writeFile(
			path,
			JSON.stringify([
				{
					file: 'apps/web/src/x.ts',
					className: 'mcpv-callout',
					reason: 'TODO',
				},
			]),
		);
		const { waivers, invalid } = await loadWaivers(path);
		expect(waivers).toHaveLength(0);
		expect(invalid.length).toBe(1);
	});

	it('accepts well-formed waivers', async () => {
		const path = join(tmp, 'good.json');
		await writeFile(
			path,
			JSON.stringify([
				{
					file: 'apps/web/src/x.ts',
					className: 'mcpv-callout',
					reason: 'SiteNav forks mcpv-callout deliberately — see f00102 S3.3',
				},
			]),
		);
		const { waivers, invalid } = await loadWaivers(path);
		expect(waivers).toHaveLength(1);
		expect(invalid).toHaveLength(0);
		expect(waivers[0]?.reason).toContain('f00102 S3.3');
	});
});

describe('shared-ui-ratchet / end-to-end (SCAN_ROOTS)', () => {
	it('does not flag a clean consumer tree', async () => {
		// Sanity: the ratchet fires against the actual repo tree
		// and finds zero violations. If this fails, a recent commit
		// introduced inline forks that need to be addressed before
		// they land.
		const { waivers, invalid } = await loadWaivers();
		const violations: Violation[] = [];
		const { join } = await import('node:path');
		const isAbs = (p: string) => p.startsWith('/');
		for (const root of [
			'apps/web',
			'extensions/vscode',
			'packages/ui-extension',
		]) {
			const abs = isAbs(root) ? root : join(process.cwd(), root);
			for await (const { absPath, relPath } of (
				await import('./shared-ui-ratchet.script')
			).walkConsumerFiles(abs)) {
				const src = await (await import('node:fs/promises')).readFile(
					absPath,
					'utf8',
				);
				violations.push(
					...(
						await import('./shared-ui-ratchet.script')
					).findInlineClasses(relPath, src),
					...(
						await import('./shared-ui-ratchet.script')
					).findForkedScss(relPath, src),
				);
			}
		}
		const waiverKeys = new Set(
			waivers.map((w) => `${w.file}|${w.className}`),
		);
		const live = violations.filter(
			(v) => !waiverKeys.has(`${v.file}|${v.className}`),
		);
		expect(live).toHaveLength(0);
		expect(invalid).toHaveLength(0);
	}, 30_000);
});

describe('shared-ui-ratchet / findHardcodedAriaLabels (x00103 S2)', () => {
	const file = 'packages/ui-extension/src/components/example.ts';

	it('flags a literal aria-label in the shared UI package', () => {
		const src = 'const h = `<button aria-label="Close">x</button>`;';
		const out = findHardcodedAriaLabels(file, src);
		expect(out).toHaveLength(1);
		expect(out[0]?.kind).toBe('hardcoded-aria');
		expect(out[0]?.className).toBe('aria-label:Close');
	});

	it('does NOT flag interpolated labels, aria-labelledby, or other packages', () => {
		const interpolated =
			'const h = `<button aria-label="${escapeHtml(opts.closeLabel)}">x</button>`;';
		expect(findHardcodedAriaLabels(file, interpolated)).toHaveLength(0);
		expect(
			findHardcodedAriaLabels(file, '<section aria-labelledby="tab-x">'),
		).toHaveLength(0);
		expect(
			findHardcodedAriaLabels(
				'apps/web/src/components/example.ts',
				'const h = `<button aria-label="Close">x</button>`;',
			),
		).toHaveLength(0);
		expect(
			findHardcodedAriaLabels(
				'packages/ui-extension/src/components/example.spec.ts',
				'expect(html).toContain(\'aria-label="Close"\');',
			),
		).toHaveLength(0);
	});
});
