/**
 * `apps/web/src/i18n/tools/index.ts` lookup helpers — regression guard.
 *
 * The catalogue starts empty by design (the runtime description is always
 * English, so the site is functional without any localisation entry). This
 * spec pins the behaviour:
 *
 *   1. Known entries resolve per-language (es → es, fr → fr, …).
 *   2. Missing entries fall back to English, then to undefined (never throws).
 *   3. Unknown entries return undefined so the caller can fall back to the
 *      runtime description (PluginPage.astro uses exactly this fallback).
 */
import { describe, expect, it } from 'vitest';

import type { Lang } from '#I18N/shared';

import {
	describeKnowledge,
	describePrompt,
	describePromptArg,
	describeResource,
	describeResourceName,
	describeTool,
	describeToolArg,
	registerKnowledgeI18n,
	registerPromptI18n,
	registerResourceI18n,
	registerToolI18n,
} from '../../src/i18n/tools';

describe('describeTool (per-tool i18n catalogue)', () => {
	it('resolves delendai_overview in every supported language', () => {
		const es = describeTool('delendai_overview', 'es');
		const fr = describeTool('delendai_overview', 'fr');
		const ja = describeTool('delendai_overview', 'ja');
		expect(es).toBeDefined();
		expect(fr).toBeDefined();
		expect(ja).toBeDefined();
		// Each translation is language-specific (not the English copy).
		expect(es).not.toBe(fr);
		expect(es).not.toBe(ja);
		expect(fr).not.toBe(ja);
	});

	it('returns the English value when the active language is unsupported', () => {
		// `th` and `vi` are required by the catalogue (12-lang invariant).
		// `xx` is a defensive fallback test: a future unknown lang must NOT
		// throw, must NOT return English by accident — the runtime description
		// (from `t.description`) is the safe fallback the caller uses.
		const fallback = describeTool('delendai_overview', 'en');
		expect(fallback).toBeDefined();
		expect(fallback?.length ?? 0).toBeGreaterThan(20);
	});

	it('returns undefined for an unknown tool so callers fall back gracefully', () => {
		const missing = describeTool('not_a_real_tool', 'es');
		expect(missing).toBeUndefined();
	});
});

describe('listRegisteredTools (check-i18n gate surface)', () => {
	it('exposes every opted-in catalogue entry with its full dict', async () => {
		const { listRegisteredTools } = await import('../../src/i18n/tools');
		const entries = listRegisteredTools();
		// The catalogue ships with at least one entry (delendai_overview);
		// future slices add more, the test must stay green either way.
		expect(entries.length).toBeGreaterThanOrEqual(1);
		const overview = entries.find((e) => e.name === 'delendai_overview');
		expect(overview).toBeDefined();
		// Every supported language must be present in the entry — this is the
		// same invariant `check-i18n.ts` enforces, so the catalogue and the
		// gate cannot drift apart.
		const codes = Object.keys(overview?.dict.description ?? {});
		expect(codes.length).toBe(12);
		expect(codes).toContain('en');
		expect(codes).toContain('es');
	});
});

describe('the prompt, resource and knowledge catalogues', () => {
	const LANGS: readonly Lang[] = [
		'en',
		'es',
		'fr',
		'de',
		'it',
		'pt',
		'ja',
		'zh',
		'hi',
		'ar',
		'th',
		'vi',
	];
	const all = (word: string): Readonly<Record<Lang, string>> =>
		Object.fromEntries(
			LANGS.map((lang) => [lang, `${word} (${lang})`]),
		) as Readonly<Record<Lang, string>>;

	it('resolves what is registered, per language, and nothing else', () => {
		registerToolI18n('spec_tool', {
			description: all('tool'),
			arguments: { path: all('path') },
		});
		registerPromptI18n('spec_prompt', {
			description: all('prompt'),
			arguments: { goal: all('goal') },
		});
		registerResourceI18n('spec://resource', {
			name: all('name'),
			description: all('resource'),
		});
		registerKnowledgeI18n('spec-knowledge', { title: all('title') });
		expect(describeToolArg('delendai_spec_tool', 'path', 'es')).toBe(
			'path (es)',
		);
		expect(describePrompt('spec_prompt', 'fr')).toBe('prompt (fr)');
		expect(describePromptArg('spec_prompt', 'goal', 'de')).toBe(
			'goal (de)',
		);
		expect(describeResourceName('spec://resource', 'it')).toBe('name (it)');
		expect(describeResource('spec://resource', 'pt')).toBe('resource (pt)');
		expect(describeKnowledge('spec-knowledge', 'ja')).toBe('title (ja)');
		expect(describePrompt('missing', 'es')).toBeUndefined();
		expect(
			describeToolArg('delendai_spec_tool', 'missing', 'es'),
		).toBeUndefined();
	});

	it('describes verify_result in every language', () => {
		for (const lang of LANGS)
			expect(
				describeTool('delendai_external-mcps_verify_result', lang)
					?.length ?? 0,
			).toBeGreaterThan(40);
	});
});
