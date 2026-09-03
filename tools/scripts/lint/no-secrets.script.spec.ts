import { describe, expect, it } from 'vitest';

import {
	maskMatch,
	redactionPlaceholder,
	redactTextInPlace,
	scanText,
	scanUnifiedDiff,
} from './no-secrets.script';

// Assembled, never written out: this file is checked in, and a test
// about not committing credentials has no business committing one.
const stripeKey = ['sk', 'live', `51H8xKlmNoPqRsTuVwXyZ${'0123'}`].join('_');
const githubToken = `ghp_${'A1b2C3d4E5f6G7h8I9j0'}${'K1l2M3n4O5p6Q7r8S9t0'}`;

describe('no-secrets scanning', () => {
	it('catches the exact string that blocked a push on 2026-09-03', () => {
		const findings = scanText('a.ts', `const k = '${stripeKey}';`);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.rule).toBe('stripe-key');
	});

	it('never puts the credential in its own report', () => {
		const findings = scanText('a.ts', `const k = '${stripeKey}';`);
		expect(JSON.stringify(findings)).not.toContain(stripeKey);
		expect(maskMatch(stripeKey)).not.toContain('51H8');
		// The issuer prefix survives, because that is the part that
		// tells the author WHICH credential leaked.
		expect(maskMatch(stripeKey).startsWith('sk_l')).toBe(true);
	});

	it('honours an explicit, visible opt-out on the line', () => {
		const findings = scanText(
			'a.ts',
			`const k = '${stripeKey}'; // mcpv-allow-secret`,
		);
		expect(findings).toEqual([]);
	});

	it('leaves a fixture that assembles its value alone', () => {
		// The corrected form of the fixture that caused all this: the
		// coverage is identical and nothing key-shaped is checked in.
		const findings = scanText(
			'a.ts',
			"const k = ['sk', 'live', body].join('_');",
		);
		expect(findings).toEqual([]);
	});

	it('reads added lines of a diff and reports their real line numbers', () => {
		const diff = [
			'diff --git a/a.ts b/a.ts',
			'--- a/a.ts',
			'+++ b/a.ts',
			'@@ -0,0 +41,1 @@',
			`+const k = '${githubToken}';`,
		].join('\n');
		const findings = scanUnifiedDiff(diff);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.file).toBe('a.ts');
		expect(findings[0]?.line).toBe(41);
		expect(findings[0]?.rule).toBe('github-token');
	});

	it('ignores removed lines — a deletion is the fix, not a finding', () => {
		const diff = [
			'--- a/a.ts',
			'+++ b/a.ts',
			'@@ -1,1 +1,0 @@',
			`-const k = '${stripeKey}';`,
		].join('\n');
		expect(scanUnifiedDiff(diff)).toEqual([]);
	});

	it('finds every match, not every other one', () => {
		// The shared patterns carry the `g` flag, whose `lastIndex`
		// persists across calls; reusing the RegExp object silently
		// skips alternate matches.
		const text = [
			`const a = '${stripeKey}';`,
			`const b = '${stripeKey}';`,
		].join('\n');
		expect(scanText('a.ts', text)).toHaveLength(2);
	});
});

describe('no-secrets neutralising', () => {
	it('replaces the value with a placeholder that names the kind', () => {
		const result = redactTextInPlace(`const k = '${stripeKey}';`);
		expect(result.replaced).toBe(1);
		expect(result.text).not.toContain(stripeKey);
		expect(result.text).toContain('MCPV_REDACTED_SECRET_STRIPE_KEY');
	});

	it('leaves nothing that would trip the gate a second time', () => {
		// A placeholder that itself looks like a credential would make
		// the hook fail forever on its own output.
		const result = redactTextInPlace(`const k = '${stripeKey}';`);
		expect(scanText('a.ts', result.text)).toEqual([]);
	});

	it('respects the opt-out marker when neutralising too', () => {
		const line = `const k = '${stripeKey}'; // mcpv-allow-secret`;
		expect(redactTextInPlace(line).text).toBe(line);
	});

	it('names the placeholder after the rule', () => {
		expect(redactionPlaceholder('github-token')).toBe(
			'MCPV_REDACTED_SECRET_GITHUB_TOKEN',
		);
	});
});
