import { describe, expect, it } from 'vitest';

import { lintPrivacyInternalOnly } from './privacy-internal-only.script';

describe('privacy-internal-only lint', () => {
	it('accepts runtime compatibility only in options.service and removed doc notes', () => {
		const result = lintPrivacyInternalOnly({
			files: {
				'plugins/error-reporting/src/lib/options.service.ts':
					'const legacy = "internalOnly";\n',
				'plugins/error-reporting/README.md':
					'- `internalOnly` — removed in x00236; legacy values are deprecated.\n',
				'docs/delendai/plugins/notes/error-reporting.notes.md':
					'- `internalOnly` — removed in x00236; legacy values are deprecated.\n',
			},
		});
		expect(result).toEqual({
			ok: true,
			runtimeViolations: [],
			docViolations: [],
		});
	});

	it('fails when another runtime file references internalOnly', () => {
		const result = lintPrivacyInternalOnly({
			files: {
				'plugins/error-reporting/src/lib/reporter.service.ts':
					'if (options.internalOnly) return;\n',
			},
		});
		expect(result.ok).toBe(false);
		expect(result.runtimeViolations[0]).toContain('reporter.service.ts');
	});

	it('fails when docs still describe internalOnly as configurable', () => {
		const result = lintPrivacyInternalOnly({
			files: {
				'plugins/error-reporting/README.md':
					'| `internalOnly` | `boolean` | `true` | configurable |\n',
			},
		});
		expect(result.ok).toBe(false);
		expect(result.docViolations[0]).toContain('README.md');
	});
});
