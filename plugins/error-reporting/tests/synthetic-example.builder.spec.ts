import { describe, expect, it } from 'vitest';

import { buildSyntheticExample } from '../src/lib/synthetic-example.builder';
import {
	SYNTHETIC_FIXTURES,
	selectSyntheticFixture,
} from '../src/lib/synthetic-fixtures.constant';

describe('SYNTHETIC_FIXTURES', () => {
	it('covers every required synthetic domain with reserved hosts only', () => {
		expect(SYNTHETIC_FIXTURES.map((fixture) => fixture.domain)).toEqual([
			'bakery',
			'weather',
			'books',
			'pets',
			'music-catalog',
			'fictional-inventory',
		]);
		for (const fixture of SYNTHETIC_FIXTURES) {
			expect(JSON.stringify(fixture)).toMatch(
				/EXAMPLE-001|DEMO-123|SYNTHETIC-42/,
			);
			expect(JSON.stringify(fixture)).not.toMatch(
				/https?:\/\/(?!example\.(?:invalid|com))/,
			);
		}
	});

	it('selects the same fixture for the same safe seed', () => {
		const left = selectSyntheticFixture({
			packageId: '@delendai/error-reporting',
			toolName: 'quality_run_quality',
			errorCode: 'PROCESS_TIMEOUT',
			failureClass: 'INTERNAL_TIMEOUT',
		});
		const right = selectSyntheticFixture({
			packageId: '@delendai/error-reporting',
			toolName: 'quality_run_quality',
			errorCode: 'PROCESS_TIMEOUT',
			failureClass: 'INTERNAL_TIMEOUT',
		});
		expect(left).toEqual(right);
	});
});

describe('buildSyntheticExample', () => {
	it('falls back to fixture data when no schema is available', () => {
		const example = buildSyntheticExample({
			packageId: '@delendai/error-reporting',
			toolName: 'search_search',
			errorCode: 'TOOL_EXECUTION_FAILED',
			failureClass: 'INTERNAL_RUNTIME_ERROR',
		});
		expect(example.source).toBe('fixture-fallback');
		expect(example.argumentType).toBe('object');
		expect(example.context?.reservedHosts).toEqual([
			'example.invalid',
			'example.com',
		]);
		expect(JSON.stringify(example.payload)).toMatch(
			/EXAMPLE-001|DEMO-123|SYNTHETIC-42/,
		);
	});

	it('can synthesize array payloads from schema hints', () => {
		const example = buildSyntheticExample({
			packageId: '@delendai/error-reporting',
			toolName: 'docs_docs_list',
			errorCode: 'INVALID_OPTIONS',
			failureClass: 'INTERNAL_VALIDATION_ERROR',
			toolSchema: {
				type: 'array',
				items: { type: 'string' },
			},
		});
		expect(example.source).toBe('schema-fixture');
		expect(example.argumentType).toBe('array');
		expect(Array.isArray(example.payload)).toBe(true);
		expect(JSON.stringify(example.payload)).toMatch(
			/EXAMPLE-001|DEMO-123|SYNTHETIC-42|example\.(invalid|com)/,
		);
	});
});
