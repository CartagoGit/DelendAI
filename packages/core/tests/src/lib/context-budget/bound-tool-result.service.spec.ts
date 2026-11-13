import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	DEFAULT_MAX_RESPONSE_BYTES,
	TOOL_RESULT_CEILING_BYTES,
} from '@delendai/core/lib/contracts/constants/response-byte-budget.constant';
import { toolError, toolJson } from '@delendai/core/lib/shared/tool-response';
import { boundToolResult } from '@delendai/core/lib/context-budget/bound-tool-result.service';
import { configureToolOutputArtifacts } from '@delendai/core/lib/context-budget/elide-tool-result.service';

const BUDGET = { maxToolResultBytes: 1_000 };
const big = { rows: Array.from({ length: 500 }, (_, id) => ({ id })) };

interface IBounded {
	readonly isError?: boolean;
	readonly content: readonly { readonly text: string }[];
	readonly structuredContent: {
		readonly ok: boolean;
		readonly error: { readonly code: string };
		readonly __truncated: boolean;
		readonly artifact?: string;
	};
}

describe('boundToolResult', () => {
	afterEach(() => configureToolOutputArtifacts(undefined));

	it('leaves a result inside the budget alone', async () => {
		const result = toolJson({ ok: true });
		expect(await boundToolResult(result, BUDGET)).toBe(result);
	});

	it("lets a reviewer's full evidence through at the default ceiling", async () => {
		const evidence = 'e'.repeat(TOOL_RESULT_CEILING_BYTES - 1_024);
		const result = toolJson({ evidence });
		expect(await boundToolResult(result)).toBe(result);
		expect(TOOL_RESULT_CEILING_BYTES).toBeGreaterThan(
			DEFAULT_MAX_RESPONSE_BYTES,
		);
	});

	it('leaves a failure alone, whatever its size', async () => {
		const result = toolError('x'.repeat(2_000));
		expect(await boundToolResult(result, BUDGET)).toBe(result);
	});

	it('turns an oversized answer into a stated failure with its head', async () => {
		const bounded = (await boundToolResult(
			toolJson(big),
			BUDGET,
		)) as IBounded;
		expect(bounded.isError).toBe(true);
		expect(bounded.structuredContent.ok).toBe(false);
		expect(bounded.structuredContent.error.code).toBe('response-too-large');
		expect(bounded.structuredContent.__truncated).toBe(true);
		expect(JSON.parse(bounded.content[0]?.text ?? '')).toEqual(
			bounded.structuredContent,
		);
	});

	it('names where the full output was kept', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'bound-result-'));
		try {
			configureToolOutputArtifacts(dir);
			const bounded = (await boundToolResult(
				toolJson(big),
				BUDGET,
			)) as IBounded;
			const path = bounded.structuredContent.artifact ?? '';
			expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(big);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('bounds a text-only result and keeps its meta', async () => {
		const bounded = (await boundToolResult(
			{
				content: [{ type: 'text', text: 'y'.repeat(2_000) }],
				_meta: { trace: 'a' },
			},
			BUDGET,
		)) as IBounded & { readonly _meta: unknown };
		expect(bounded.isError).toBe(true);
		expect(bounded._meta).toEqual({ trace: 'a' });
	});

	it('leaves a result with no payload alone', async () => {
		const result = { content: [] };
		expect(await boundToolResult(result, BUDGET)).toEqual(result);
		expect(await boundToolResult(null, BUDGET)).toBeNull();
	});

	it('leaves anything that is no result object alone', async () => {
		expect(await boundToolResult('text')).toBe('text');
		expect(await boundToolResult(null)).toBe(null);
	});

	it('drops the path of an output it could not keep', async () => {
		const blocked = join(mkdtempSync(join(tmpdir(), 'bound-')), 'file');
		writeFileSync(blocked, '');
		configureToolOutputArtifacts(join(blocked, 'under-a-file'));
		const bounded = (await boundToolResult(toolJson(big), BUDGET)) as {
			readonly isError?: boolean;
			readonly structuredContent: { readonly artifact?: string };
		};
		expect(bounded.isError).toBe(true);
		expect(bounded.structuredContent.artifact).toBeUndefined();
	});

	it('counts the text of a result with several parts', async () => {
		const result = {
			content: [
				{ type: 'text', text: 'a'.repeat(600) },
				{ type: 'image', data: 'x' },
				{ type: 'text', text: 'b'.repeat(600) },
			],
		};
		const bounded = (await boundToolResult(result, BUDGET)) as {
			readonly isError?: boolean;
			readonly _meta?: unknown;
		};
		expect(bounded.isError).toBe(true);
		expect(bounded._meta).toBeUndefined();
	});

	it('states the head alone when no directory keeps the output', async () => {
		configureToolOutputArtifacts(undefined);
		const bounded = (await boundToolResult(toolJson(big), BUDGET)) as {
			readonly content: readonly { readonly text: string }[];
		};
		const text = bounded.content[0]?.text ?? '';
		expect(text).toContain('Narrow the call');
		expect(text).not.toContain('artifact');
	});
});
