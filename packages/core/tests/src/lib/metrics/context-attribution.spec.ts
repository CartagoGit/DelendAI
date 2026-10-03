import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { LARGEST_RESPONSES_KEPT } from '@delendai/core/lib/contracts/constants/context-attribution.constant';
import {
	attributeContext,
	keepLargest,
} from '@delendai/core/lib/metrics/context-attribution.helper';
import { createMetricsRegistry } from '@delendai/core/lib/metrics/metrics-registry';

const costOf = (bytes: number) => ({
	ms: 1,
	bytes,
	isError: false,
	cost: {
		contentTextBytes: bytes,
		structuredJsonBytes: 0,
		wireEstimateBytes: bytes,
		estimatedTokens: { estimatedTokens4B: Math.ceil(bytes / 4) },
	},
});

describe('context attribution', () => {
	it('its parts always add up to the total it reports', () => {
		fc.assert(
			fc.property(
				fc.nat({ max: 1_000_000 }),
				fc.dictionary(
					fc.string({ minLength: 1, maxLength: 8 }),
					fc.nat({ max: 1_000_000 }),
					{ maxKeys: 12 },
				),
				(listingBytes, bytes) => {
					const bytesByTool = new Map(Object.entries(bytes));
					const attribution = attributeContext({
						listingBytes,
						bytesByTool,
						largestResponses: [],
					});

					const toolBytes = [...bytesByTool.values()].reduce(
						(sum, value) => sum + value,
						0,
					);
					expect(attribution.totalBytes).toBe(
						listingBytes + toolBytes,
					);
					expect(
						attribution.parts.reduce(
							(sum, part) => sum + part.bytes,
							0,
						),
					).toBe(attribution.totalBytes);
				},
			),
			{ numRuns: 300 },
		);
	});

	it('names the listing and the five costliest tools, and sums the rest', () => {
		const attribution = attributeContext({
			listingBytes: 390,
			bytesByTool: new Map([
				['a', 10],
				['b', 60],
				['c', 50],
				['d', 40],
				['e', 30],
				['f', 20],
				['g', 0],
			]),
			largestResponses: [],
		});

		expect(attribution.parts).toEqual([
			{ source: 'tools/list', bytes: 390, share: 0.65 },
			{ source: 'b', bytes: 60, share: 0.1 },
			{ source: 'c', bytes: 50, share: 0.0833 },
			{ source: 'd', bytes: 40, share: 0.0667 },
			{ source: 'e', bytes: 30, share: 0.05 },
			{ source: 'f', bytes: 20, share: 0.0333 },
			{ source: 'other tools', bytes: 10, share: 0.0167 },
		]);
	});

	it('keeps the largest single responses, largest first', () => {
		let kept = keepLargest([], { tool: 'x', bytes: 1, at: 't0' });
		for (let index = 2; index <= LARGEST_RESPONSES_KEPT + 3; index += 1) {
			kept = keepLargest(kept, {
				tool: `t${index}`,
				bytes: index,
				at: 't',
			});
		}

		expect(kept.map((response) => response.bytes)).toEqual([8, 7, 6, 5, 4]);
	});

	it('is part of every metrics snapshot, and a reset clears it', () => {
		const registry = createMetricsRegistry();
		registry.recordToolListServed([
			{ name: 'delendai_read', bytes: 300 },
			{ name: 'delendai_write', bytes: 200 },
		]);
		registry.record('delendai_read', costOf(1_000));
		registry.record('delendai_read', costOf(50));

		const snapshot = registry.snapshot();

		expect(snapshot.attribution?.totalBytes).toBe(
			snapshot.surface.servedBytes +
				snapshot.totals.cost.wireEstimateBytes,
		);
		expect(snapshot.attribution?.parts.map((part) => part.source)).toEqual([
			'delendai_read',
			'tools/list',
		]);
		expect(
			snapshot.attribution?.largestResponses.map((response) => [
				response.tool,
				response.bytes,
			]),
		).toEqual([
			['delendai_read', 1_000],
			['delendai_read', 50],
		]);

		registry.reset();

		expect(registry.snapshot().attribution).toMatchObject({
			totalBytes: 0,
			parts: [],
			largestResponses: [],
		});
	});
});
