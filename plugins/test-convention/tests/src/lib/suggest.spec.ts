import { describe, expect, it } from 'vitest';

import {
	DEFAULT_CONVENTION,
	mergeConvention,
	suggestSpecPath,
} from '@mcp-vertex/test-convention/public';

describe('suggestSpecPath', async () => {
	it('colocates by default', async () => {
		const r = suggestSpecPath('src/lib/foo.ts', DEFAULT_CONVENTION);
		expect(r.specPath).toBe('src/lib/foo.spec.ts');
		expect(r.rationale).toContain('colocate');
		expect(r.skeleton).toContain('describe("foo"');
	});

	it('honours tests-mirror layout', async () => {
		const c = mergeConvention({ specLayout: 'tests-mirror' });
		const r = suggestSpecPath('src/lib/foo.ts', c);
		expect(r.specPath).toBe('tests/lib/foo.spec.ts');
	});

	it('honours tests-flat layout', async () => {
		const c = mergeConvention({ specLayout: 'tests-flat' });
		const r = suggestSpecPath('src/lib/foo.ts', c);
		expect(r.specPath).toBe('tests/foo.spec.ts');
	});

	it('honours a custom extension', async () => {
		const c = mergeConvention({ specExtension: 'test.ts' });
		const r = suggestSpecPath('src/lib/foo.ts', c);
		expect(r.specPath).toBe('src/lib/foo.test.ts');
	});

	it('handles non-src paths by colocating next to source', async () => {
		const r = suggestSpecPath('scripts/check.ts', DEFAULT_CONVENTION);
		expect(r.specPath).toBe('scripts/check.spec.ts');
		expect(r.rationale).toContain('non-src');
	});

	it('strips .tsx as well as .ts', async () => {
		const r = suggestSpecPath(
			'src/components/Button.tsx',
			DEFAULT_CONVENTION,
		);
		expect(r.specPath).toBe('src/components/Button.spec.ts');
	});

	it('skeleton names the module', async () => {
		const r = suggestSpecPath('src/lib/foo/bar.ts', DEFAULT_CONVENTION);
		expect(r.skeleton).toContain('describe("bar"');
	});
});
