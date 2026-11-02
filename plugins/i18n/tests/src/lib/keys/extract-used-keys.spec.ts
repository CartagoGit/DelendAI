/**
 * extract-used-keys.spec.ts — the forms a live key is named in, so
 * i18n_check never reports one of them as unused.
 */
import { describe, expect, it } from 'vitest';

import { checkLocales } from '../../../../src/lib/i18n/check-i18n';
import { extractKeyUsage } from '../../../../src/lib/keys/extract-used-keys';

const source = (content: string) => [{ path: 'src/a.tsx', content }];

describe('extractKeyUsage', () => {
	it('reads the call, attribute, descriptor and pipe forms', () => {
		const { keys } = extractKeyUsage(
			source(
				[
					"t('plain.call')",
					"$t('vue.call')",
					"i18n.t('instance.call')",
					"translate('translate.call')",
					'<Trans i18nKey="react.trans" />',
					"intl.formatMessage({ id: 'intl.message' })",
					"{{ 'angular.pipe' | translate }}",
				].join('\n'),
			),
		);
		expect([...keys].sort()).toEqual([
			'angular.pipe',
			'instance.call',
			'intl.message',
			'plain.call',
			'react.trans',
			'translate.call',
			'vue.call',
		]);
	});

	it('reads a key under the namespace its file binds the translator to', () => {
		const { keys } = extractKeyUsage(
			source("const t = useTranslations('home');\nt('title');"),
		);
		expect(keys.has('home.title')).toBe(true);
	});

	it('keeps every key under the fixed prefix of a key built at run time', () => {
		const usage = extractKeyUsage(source('t(`errors.${code}`)'));
		expect([...usage.prefixes]).toEqual(['errors.']);
		const findings = checkLocales(
			[
				{
					locale: 'en',
					data: {
						errors: { notFound: 'x', denied: 'y' },
						stale: 'z',
					},
				},
			],
			{ usedKeys: usage.keys, usedKeyPrefixes: usage.prefixes },
		);
		// usedKeys is empty here, so nothing is judged unused.
		expect(findings).toEqual([]);
		const withLiteral = extractKeyUsage(
			source("t('kept');\nt(`errors.${code}`)"),
		);
		const unused = checkLocales(
			[
				{
					locale: 'en',
					data: { kept: 'k', errors: { notFound: 'x' }, stale: 'z' },
				},
			],
			{
				usedKeys: withLiteral.keys,
				usedKeyPrefixes: withLiteral.prefixes,
			},
		).map((finding) => finding.message);
		expect(unused).toEqual([
			'en: key "stale" is not referenced by the scanned source files',
		]);
	});
});
