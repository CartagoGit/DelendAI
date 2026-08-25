/**
 * privacy-validator-anti-pattern.ts — x00256 S1 acceptance fixture.
 *
 * This file is INTENTIONALLY invalid: it adds a "company-name
 * stopword" list to a hypothetical privacy validator. The
 * `privacy-validator-no-expansion` lint
 * (`tools/scripts/lint/privacy-validator-no-expansion.script.ts`)
 * MUST reject this fixture on `--apply`. In dry-run mode the lint
 * merely prints the violation so the failure is observable.
 *
 * The fixture does NOT extend `privacy-validator.helper.ts` itself
 * — it lives under `tests/fixtures/` and is only ever imported by
 * the lint script's "should fail" smoke test. Its sole purpose is
 * to give the lint a real artefact to flag.
 *
 * Do NOT add this kind of list to the production validator.
 */
export const COMPANY_NAME_STOPWORDS = [
	'Acme',
	'Bank',
	'Corp',
	'Ltd',
	'Industries',
	'Holdings',
	'Group',
] as const;
