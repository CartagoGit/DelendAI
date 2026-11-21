import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { renderBranchFilters } from '../../../../src/lib/services/rehearsal-real-ci.service';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../'.repeat(6));

describe('renderBranchFilters on the project ci.yml', () => {
	const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
	const lineWith = (text: string, needle: string): string =>
		text.split('\n').find((line) => line.includes(needle)) ?? '';

	it('[<20ms] conditions the signal job on the rehearsal branch and leaves every other develop-gated line alone', () => {
		const out = renderBranchFilters(ci, 'ns/rehearsal/r1/x', 'develop');
		const lines = out.split('\n');
		const signal = lines.slice(lines.indexOf('    integration-signal:'));
		expect(signal.find((l) => l.includes('if:'))).toContain(
			"github.ref == 'refs/heads/ns/rehearsal/r1/x'",
		);
		expect(signal.find((l) => l.includes('if:'))).not.toContain(
			'refs/heads/develop',
		);
		for (const needle of ['cancel-in-progress:', 'TARGETS_DEVELOP:'])
			expect(lineWith(out, needle)).toBe(lineWith(ci, needle));
	});

	it('[<20ms] is the identity on the gate when the branch is the project one', () => {
		const out = renderBranchFilters(ci, 'develop', 'develop');
		expect(lineWith(out, 'always() &&')).toBe(lineWith(ci, 'always() &&'));
	});
});
