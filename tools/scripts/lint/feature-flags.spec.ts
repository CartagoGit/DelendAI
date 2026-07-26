import { describe, expect, it } from 'vitest';

import { parseFeatureFlagCatalog } from './feature-flags.script';

const GOOD = `| Name | Since | Default | Removal | Description |
| --- | --- | --- | --- | --- |
| \`foo.bar\` | 0.1.0 | \`false\` | 0.3.0 | A test flag. |
| \`baz.qux\` | 0.2.0 | \`true\` | 0.4.0 | Another test flag. |
`;

const MALFORMED_SHORT = `| Name | Since | Default | Removal | Description |
| --- | --- | --- | --- | --- |
| short | | | | row |
`;

const MALFORMED_DEFAULT = `| Name | Since | Default | Removal | Description |
| --- | --- | --- | --- | --- |
| \`x\` | 0.1.0 | maybe | 0.3.0 | A bad default. |
`;

describe('parseFeatureFlagCatalog (f00152 S5)', () => {
	it('parses a well-formed catalog', () => {
		const verdict = parseFeatureFlagCatalog(GOOD);
		expect(verdict.ok).toBe(true);
		expect(verdict.entries).toHaveLength(2);
		expect(verdict.entries[0]?.name).toBe('foo.bar');
		expect(verdict.entries[0]?.defaultValue).toBe(false);
		expect(verdict.entries[1]?.name).toBe('baz.qux');
		expect(verdict.entries[1]?.defaultValue).toBe(true);
	});

	it('reports rows with fewer than 5 cells', () => {
		const verdict = parseFeatureFlagCatalog(MALFORMED_SHORT);
		expect(verdict.ok).toBe(false);
		expect(verdict.errors.length).toBeGreaterThan(0);
		expect(verdict.entries).toHaveLength(0);
	});

	it('reports non-boolean default values', () => {
		const verdict = parseFeatureFlagCatalog(MALFORMED_DEFAULT);
		expect(verdict.ok).toBe(false);
		expect(verdict.errors.some((error) => error.includes('defaultValue'))).toBe(true);
	});

	it('returns empty entries for an empty file', () => {
		const verdict = parseFeatureFlagCatalog('');
		expect(verdict.ok).toBe(true);
		expect(verdict.entries).toHaveLength(0);
	});
});