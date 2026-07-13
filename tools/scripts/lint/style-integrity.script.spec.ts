import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { IStyleSourceFile } from './style-integrity.script';
import {
	checkStyleIntegrity,
	detectStyleIntegrity,
	extractDefinedClasses,
	extractUsedClasses,
	formatReport,
	globToRegExp,
	parseAstro,
	splitSelectorList,
} from './style-integrity.script';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const scss = (text: string): IStyleSourceFile => ({
	path: 'apps/web/src/styles/components/_fixture.scss',
	text,
});

const astro = (path: string, text: string): IStyleSourceFile => ({
	path,
	text,
});

const WAIVER_REASON =
	'intentional bare BEM base whose elements carry the styles';

describe('style-integrity.script', () => {
	describe('extractDefinedClasses (scss nesting expansion)', () => {
		it('expands &__x, &--x and &-x under the parent selector stack', () => {
			const defined = extractDefinedClasses(
				[
					'.card {',
					'\tcolor: red;',
					'\t&__title { font-weight: 700; }',
					'\t&--wide { width: 100%; }',
					'\t&-footer { margin-top: 1rem; }',
					'\t&__title--muted { opacity: 0.6; }',
					'}',
				].join('\n'),
			);
			expect([...defined].sort()).toEqual([
				'card',
				'card--wide',
				'card-footer',
				'card__title',
				'card__title--muted',
			]);
		});

		it('splits comma-separated selector lists — .a, .b defines both', () => {
			const defined = extractDefinedClasses(
				'.plugin-disc__empty,\n.plugin-disc__requires {\n\tcolor: gray;\n}',
			);
			expect(defined.has('plugin-disc__empty')).toBe(true);
			expect(defined.has('plugin-disc__requires')).toBe(true);
		});

		it('expands nesting under comma-separated parents', () => {
			const defined = extractDefinedClasses(
				'.a, .b {\n\t&__x { color: red; }\n}',
			);
			expect(defined.has('a__x')).toBe(true);
			expect(defined.has('b__x')).toBe(true);
		});

		it('collects classes from descendant and compound selectors', () => {
			const defined = extractDefinedClasses(
				'.presets__matrix th,\n.presets__matrix td { padding: 0; }\ntable.wide .cell { color: red; }',
			);
			expect(defined.has('presets__matrix')).toBe(true);
			expect(defined.has('wide')).toBe(true);
			expect(defined.has('cell')).toBe(true);
		});

		it('keeps the parent context through transparent at-rules (@media)', () => {
			const defined = extractDefinedClasses(
				'.nav {\n\t@media (min-width: 60rem) {\n\t\t&__list { display: flex; }\n\t}\n}',
			);
			expect(defined.has('nav__list')).toBe(true);
		});

		it('never lets a class token span a #{…} interpolation splice', () => {
			const defined = extractDefinedClasses(
				'@each $name in a, b {\n\t.icon-#{$name} { color: red; }\n}',
			);
			expect(defined.has('icon-')).toBe(false);
			expect(defined.has('icon-a')).toBe(false);
		});

		it('ignores selectors inside comments and class-looking strings', () => {
			const defined = extractDefinedClasses(
				[
					'/* .ghost { color: red; } */',
					'// .also-ghost { color: red; }',
					'.real { content: ".fake"; }',
				].join('\n'),
			);
			expect([...defined]).toEqual(['real']);
		});
	});

	describe('parseAstro + extractUsedClasses', () => {
		it('strips frontmatter and <style>/<script> but keeps line numbers', () => {
			const parts = parseAstro(
				[
					'---',
					'const x = \'class="frontmatter-only"\';',
					'---',
					'<div class="kept">',
					'\t<style>.local { color: red; }</style>',
					'\t<script>const c = \'class="scripted"\';</script>',
					'</div>',
				].join('\n'),
			);
			expect(parts.styleBlocks).toEqual(['.local { color: red; }']);
			const used = extractUsedClasses(parts.markup);
			expect(used).toEqual([{ className: 'kept', line: 4 }]);
		});

		it('reads static class attributes in both quote styles, splitting tokens', () => {
			const used = extractUsedClasses(
				'<div class="a b--mod">\n<span class=\'c\'></span>\n</div>',
			);
			expect(used.map((entry) => entry.className)).toEqual([
				'a',
				'b--mod',
				'c',
			]);
		});

		it('skips dynamic class={…} and class:list={…} expressions', () => {
			const used = extractUsedClasses(
				'<div class={cond ? "x" : "y"}>\n<div class:list={["mq", { on }]}>\n<div class={`t-${v}`}>',
			);
			expect(used).toEqual([]);
		});

		it('skips tokens that are not plain class names', () => {
			const used = extractUsedClasses(
				'<div class="ok 2bad -also_bad {x}">',
			);
			expect(used.map((entry) => entry.className)).toEqual(['ok']);
		});
	});

	describe('splitSelectorList / globToRegExp', () => {
		it('splits on top-level commas only', () => {
			expect(splitSelectorList('.a, .b:not(.c, .d), .e')).toEqual([
				'.a',
				'.b:not(.c, .d)',
				'.e',
			]);
		});

		it('matches ** across directories and * within one', () => {
			const deep = globToRegExp('apps/web/src/**/*.astro');
			expect(deep.test('apps/web/src/pages/status/logs.astro')).toBe(
				true,
			);
			const shallow = globToRegExp('apps/web/src/pages/*.astro');
			expect(shallow.test('apps/web/src/pages/presets.astro')).toBe(true);
			expect(shallow.test('apps/web/src/pages/status/logs.astro')).toBe(
				false,
			);
		});
	});

	describe('checkStyleIntegrity', () => {
		it('passes when every used class is defined globally or locally', () => {
			const report = checkStyleIntegrity(
				[scss('.hero { &__title { color: red; } }')],
				[
					astro(
						'apps/web/src/pages/a.astro',
						'<div class="hero hero__title local"></div>\n<style>.local { color: blue; }</style>',
					),
				],
				[],
			);
			expect(report.findings).toEqual([]);
			expect(report.stats.usedClasses).toBe(3);
			expect(formatReport(report)).toContain('✓ style-integrity');
		});

		it('fails on a used-but-undefined class with an actionable message', () => {
			const report = checkStyleIntegrity(
				[scss('.hero { color: red; }')],
				[
					astro(
						'apps/web/src/pages/a.astro',
						'<div class="hero">\n\t<span class="hero__ghost"></span>\n</div>',
					),
				],
				[],
			);
			expect(report.findings).toHaveLength(1);
			expect(report.findings[0]).toMatchObject({
				file: 'apps/web/src/pages/a.astro',
				line: 2,
				className: 'hero__ghost',
			});
			expect(formatReport(report)).toContain(
				'used in markup but defined nowhere',
			);
		});

		it('scopes component-local <style> definitions to their own file', () => {
			const local =
				'<div class="only-here"></div>\n<style>.only-here { color: red; }</style>';
			const other = '<div class="only-here"></div>';
			const report = checkStyleIntegrity(
				[],
				[
					astro('apps/web/src/pages/a.astro', local),
					astro('apps/web/src/pages/b.astro', other),
				],
				[],
			);
			expect(report.findings).toHaveLength(1);
			expect(report.findings[0]?.file).toBe('apps/web/src/pages/b.astro');
		});

		it('honours a scoped waiver in its file and nowhere else', () => {
			const waiver = {
				class: 'bare-hook',
				scope: 'apps/web/src/pages/a.astro',
				reason: WAIVER_REASON,
			};
			const inScope = checkStyleIntegrity(
				[],
				[
					astro(
						'apps/web/src/pages/a.astro',
						'<div class="bare-hook">',
					),
				],
				[waiver],
			);
			expect(inScope.findings).toEqual([]);
			expect(inScope.stats.waived).toBe(1);

			const outOfScope = checkStyleIntegrity(
				[],
				[
					astro(
						'apps/web/src/pages/b.astro',
						'<div class="bare-hook">',
					),
				],
				[waiver],
			);
			// One finding for the undefined class, one for the now-stale waiver.
			expect(outOfScope.findings).toHaveLength(2);
			expect(outOfScope.findings[0]?.className).toBe('bare-hook');
			expect(outOfScope.findings[1]?.reason).toContain('stale entry');
		});

		it('rejects placeholder waiver reasons', () => {
			const report = checkStyleIntegrity(
				[],
				[
					astro(
						'apps/web/src/pages/a.astro',
						'<div class="bare-hook">',
					),
				],
				[{ class: 'bare-hook', reason: 'TODO' }],
			);
			expect(
				report.findings.map((finding) => finding.reason).join('\n'),
			).toContain('documented reason');
		});

		it('flags a stale waiver so the file cannot rot', () => {
			const report = checkStyleIntegrity(
				[scss('.hero { color: red; }')],
				[astro('apps/web/src/pages/a.astro', '<div class="hero">')],
				[{ class: 'ghost', reason: WAIVER_REASON }],
			);
			expect(report.findings).toHaveLength(1);
			expect(report.findings[0]?.reason).toContain(
				'matched no used-but-undefined class',
			);
		});

		it('ignores third-party / cross-ratchet classes without waivers', () => {
			const report = checkStyleIntegrity(
				[],
				[
					astro(
						'apps/web/src/pages/a.astro',
						'<div class="astro-island pagefind-ui markdown-body sr-only mcpv-callout">',
					),
				],
				[],
			);
			expect(report.findings).toEqual([]);
			expect(report.stats.ignored).toBe(5);
		});
	});

	it('passes on the real repository with the checked-in waivers', async () => {
		const report = await detectStyleIntegrity({
			styleRoots: [
				join(REPO_ROOT, 'apps/web/src/styles'),
				join(REPO_ROOT, 'apps/shared/src/styles'),
			],
			astroRoots: [join(REPO_ROOT, 'apps/web/src')],
			waiversPath: join(
				REPO_ROOT,
				'tools/scripts/lint/style-integrity.waivers.json',
			),
		});
		expect(report.findings).toEqual([]);
		expect(report.stats.scssFiles).toBeGreaterThan(0);
		expect(report.stats.astroFiles).toBeGreaterThan(0);
		expect(formatReport(report)).toContain('✓ style-integrity');
	});
});
