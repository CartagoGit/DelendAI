import { describe, expect, it } from 'vitest';

import { detectCatchSwallow } from '../../../../src/lib/scan/catch-swallow';

describe('scan/catch-swallow — detectCatchSwallow', () => {
	it('flags an empty catch {}', () => {
		const body = [
			'export const safe = async () => {',
			'  try {',
			'    await doThing();',
			'  } catch {}',
			'};',
		].join('\n');
		const hits = detectCatchSwallow(body);
		expect(hits).toHaveLength(1);
		expect(hits[0]?.line).toBe(4);
	});

	it('flags a catch whose body is a single comment', () => {
		const body = [
			'export const safe = async () => {',
			'  try {',
			'    await doThing();',
			'  } catch (e) {',
			'    /* swallow */',
			'  }',
			'};',
		].join('\n');
		const hits = detectCatchSwallow(body);
		expect(hits.length).toBeGreaterThan(0);
	});

	it('does not flag a catch that handles the error', () => {
		const body = [
			'export const safe = async () => {',
			'  try {',
			'    await doThing();',
			'  } catch (e) {',
			'    log.error(e);',
			'  }',
			'};',
		].join('\n');
		expect(detectCatchSwallow(body)).toHaveLength(0);
	});

	it('returns no hits on a body without try/catch', () => {
		const body = 'export const a = 1;\nexport const b = 2;';
		expect(detectCatchSwallow(body)).toHaveLength(0);
	});

	it('preserves exact snippets for empty and comment-only catches', () => {
		const body = [
			'try {',
			'  run();',
			'} catch {}',
			'try {',
			'  runAgain();',
			'} catch (error) {',
			'  /* swallow */',
			'}',
		].join('\n');
		expect(detectCatchSwallow(body)).toEqual([
			{ line: 3, snippet: 'catch {}' },
			{ line: 6, snippet: 'catch (error) { /* swallow */ }' },
		]);
	});

	it('does not backtrack pathologically on a long unterminated catch header', () => {
		const body = `try {} catch${' '.repeat(40_000)}(${`error${' '.repeat(40_000)}`}`;
		const started = Date.now();
		expect(detectCatchSwallow(body)).toEqual([]);
		expect(Date.now() - started).toBeLessThan(500);
	});
});
