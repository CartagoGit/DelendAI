import { describe, expect, it } from 'vitest';

import {
	buildTokenizerEstimates,
	estimateTokensFromBytes,
	TOKENIZER_MODELS,
} from '../../scripts/report/tokenizer-real.script';

describe('buildTokenizerEstimates', () => {
	it('records one attributable profile per model, in a stable order', () => {
		const estimates = buildTokenizerEstimates('{"name":"probe"}');
		expect(estimates.map((estimate) => estimate.model)).toEqual(
			TOKENIZER_MODELS,
		);
		for (const estimate of estimates) {
			expect(estimate.tokenizerId.length).toBeGreaterThan(0);
			expect(estimate.note.length).toBeGreaterThan(0);
			expect(estimate.tokenCount).toBeGreaterThan(0);
		}
	});

	it('labels gpt-5.4 as a real tokenizer encode, not an estimate', () => {
		const [gpt5] = buildTokenizerEstimates('{"a":"b"}');
		expect(gpt5?.model).toBe('gpt-5.4');
		expect(gpt5?.confidence).toBe('measured-real-bpe');
	});

	it('labels claude-sonnet-4 as a real encode on a different (legacy) vocabulary', () => {
		const [, claude] = buildTokenizerEstimates('{"a":"b"}');
		expect(claude?.model).toBe('claude-sonnet-4');
		expect(claude?.confidence).toBe('measured-legacy-bpe');
	});

	it('falls back to an explicit byte-ratio estimate for gemini, matching the heuristic exactly', () => {
		const jsonText =
			'{"description":"a fairly long description of a tool"}';
		const [, , gemini] = buildTokenizerEstimates(jsonText);
		expect(gemini?.model).toBe('gemini-2.5-pro');
		expect(gemini?.confidence).toBe('estimated-byte-ratio');
		expect(gemini?.tokenCount).toBe(
			estimateTokensFromBytes(Buffer.byteLength(jsonText, 'utf8')),
		);
	});

	it('real tokenizer counts differ from the byte-ratio heuristic on the same text', () => {
		// If the real encoders ever collapsed onto the heuristic number this
		// would silently stop being "real tokenization" and become the same
		// disguised byte count the audit flagged.
		const jsonText = JSON.stringify({
			name: 'mcp-vertex_proposals_round_context',
			description:
				'Return the current proposal round context, including active slices, owners, and gate status for the working proposal.',
			inputSchema: { type: 'object', properties: {} },
		});
		const [gpt5] = buildTokenizerEstimates(jsonText);
		const heuristic = estimateTokensFromBytes(
			Buffer.byteLength(jsonText, 'utf8'),
		);
		expect(gpt5?.tokenCount).not.toBe(heuristic);
	});
});
