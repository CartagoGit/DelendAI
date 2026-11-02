import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { joinUnderRoot } from '@delendai/core/public';

const ROOT = resolve('/work/space');

describe('joinUnderRoot', () => {
	it('joins a relative rel onto the root, same as path.join', () => {
		expect(joinUnderRoot(ROOT, 'cache')).toBe(join(ROOT, 'cache'));
		expect(joinUnderRoot(ROOT, 'a/b/c')).toBe(join(ROOT, 'a/b/c'));
	});

	it('returns an absolute rel unchanged instead of nesting it under root', () => {
		// path.join('/abs', '/x') would return '/abs/x' — the caller's
		// explicit absolute override silently mangled. joinUnderRoot
		// honors the override instead.
		expect(joinUnderRoot('/abs', '/x')).toBe('/x');
		expect(joinUnderRoot(ROOT, '/tmp/override-cache')).toBe(
			'/tmp/override-cache',
		);
	});

	it('does not collapse a `..` prefix — that stays the caller responsibility', () => {
		expect(joinUnderRoot(ROOT, '../escaped')).toBe(
			join(ROOT, '../escaped'),
		);
	});
});
