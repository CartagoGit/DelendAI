/**
 * Specs for `no-core-public-types-in-client` (x00545).
 *
 * The lint shipped with no spec and was green over four real
 * violations for as long as it has existed: it split each file into
 * lines and ran its regex per line, so it could only ever see an
 * import written entirely on one line. This repo's house style wraps
 * import specifiers across lines, which is precisely the shape it
 * could not match.
 *
 * Every case below is written against `findViolations`, the pure half,
 * so the guard is exercised on source text rather than on whatever
 * happens to be in `packages/client` today. The multi-line cases are
 * the regression pins.
 */
import { describe, expect, it } from 'vitest';

import { findViolations } from './no-core-public-types-in-client.script';

describe('findViolations', async () => {
	it('flags a single-line type-only import from the public barrel', async () => {
		const found = findViolations(
			`import type { IFoo } from '@delendai/core/public';\n`,
		);
		expect(found).toHaveLength(1);
		expect(found[0]?.line).toBe(1);
	});

	it('flags a MULTI-LINE type-only import (the blind spot x00545 fixes)', async () => {
		const found = findViolations(
			[
				`import type {`,
				`\tIDelendaiConfigFile,`,
				`\tIDelendaiPluginConfig,`,
				`\tIScaffoldedFile,`,
				`} from '@delendai/core/public';`,
			].join('\n'),
		);
		expect(found).toHaveLength(1);
		expect(found[0]?.line).toBe(1);
	});

	it('reports the line the import STARTS on, not where it closes', async () => {
		const found = findViolations(
			[
				`const x = 1;`,
				``,
				`import type {`,
				`\tIFoo,`,
				`} from '@delendai/core/public';`,
			].join('\n'),
		);
		expect(found[0]?.line).toBe(3);
	});

	it('flags the bare specifier as well as /public', async () => {
		const found = findViolations(
			`import type {\n\tIFoo,\n} from '@delendai/core';\n`,
		);
		expect(found).toHaveLength(1);
	});

	it('flags an inline `type` modifier inside a mixed import', async () => {
		const found = findViolations(
			`import {\n\tcreateThing,\n\ttype IFoo,\n} from '@delendai/core/public';\n`,
		);
		expect(found).toHaveLength(1);
	});

	it('allows a VALUE import from the public barrel', async () => {
		const found = findViolations(
			`import {\n\tcreateThing,\n} from '@delendai/core/public';\n`,
		);
		expect(found).toEqual([]);
	});

	it('allows a type-only import from the contracts subpath', async () => {
		const found = findViolations(
			`import type {\n\tIFoo,\n} from '@delendai/core/contracts';\n`,
		);
		expect(found).toEqual([]);
	});

	it('allows a type-only import from the runtime subpath', async () => {
		const found = findViolations(
			`import type { IFoo } from '@delendai/core/runtime';\n`,
		);
		expect(found).toEqual([]);
	});

	it('ignores a matching import inside a line comment', async () => {
		const found = findViolations(
			`// import type { IFoo } from '@delendai/core/public';\n`,
		);
		expect(found).toEqual([]);
	});

	it('ignores a matching import inside a block comment', async () => {
		const found = findViolations(
			[
				`/**`,
				` * import type {`,
				` *   IFoo,`,
				` * } from '@delendai/core/public';`,
				` */`,
			].join('\n'),
		);
		expect(found).toEqual([]);
	});

	it('does not match a longer package whose name starts the same', async () => {
		const found = findViolations(
			`import type { IFoo } from '@delendai/core-extras';\n`,
		);
		expect(found).toEqual([]);
	});

	it('reports each of several violations separately', async () => {
		const found = findViolations(
			[
				`import type {`,
				`\tIFoo,`,
				`} from '@delendai/core/public';`,
				`import type { IBar } from '@delendai/core';`,
			].join('\n'),
		);
		expect(found).toHaveLength(2);
		expect(found.map((f) => f.line)).toEqual([1, 4]);
	});

	it('names the offending specifier in the reason', async () => {
		const found = findViolations(
			`import type {\n\tIFoo,\n} from '@delendai/core/public';\n`,
		);
		expect(found[0]?.reason).toContain('@delendai/core/public');
		expect(found[0]?.reason).toContain('@delendai/core/contracts');
	});

	it('returns nothing for a file with no imports at all', async () => {
		expect(findViolations(`export const x = 1;\n`)).toEqual([]);
	});
});
