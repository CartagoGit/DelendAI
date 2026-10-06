import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IFileReader, IToolTextResult } from '@delendai/core/public';

import { buildQualityComplexityToolRegistration } from '../../../src/lib/tools/quality-complexity.tool';

type Handler = (args: unknown) => Promise<IToolTextResult>;

const write = (root: string, rel: string, body: string): void => {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, body, 'utf8');
};

const noopReader: IFileReader = {
	readFile: async () => undefined,
	exists: async () => false,
	listDir: async () => [],
};

const bodyOf = (result: IToolTextResult): Record<string, unknown> =>
	JSON.parse((result.content[0] as { text: string }).text) as Record<
		string,
		unknown
	>;

describe('quality_complexity tool', () => {
	let root = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'quality-complexity-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('finds hotspots over the threshold', async () => {
		write(
			root,
			'src/hotspot.ts',
			'export function hotspot(v:boolean){ if(v){for(const x of [1]){ if(x){return 1;} }} return 0; }',
		);
		const registration = buildQualityComplexityToolRegistration({
			namespacePrefix: 'quality',
			reader: noopReader,
			workspaceRoot: root,
			run: async () => ({ code: 0, output: '', timedOut: false }),
		});
		let handler: Handler | undefined;
		await registration.register({
			registerTool: (_name: string, _schema: unknown, next: Handler) => {
				handler = next;
			},
		} as never);
		const body = bodyOf(await handler!({ threshold: 3 }));
		expect(body.ok).toBe(true);
		expect(body.findings).toEqual([
			expect.objectContaining({ function: 'hotspot', threshold: 3 }),
		]);
	});

	it('returns toolError on invalid input', async () => {
		const registration = buildQualityComplexityToolRegistration({
			namespacePrefix: 'quality',
			reader: noopReader,
			workspaceRoot: root,
			run: async () => ({ code: 0, output: '', timedOut: false }),
		});
		let handler: Handler | undefined;
		await registration.register({
			registerTool: (_name: string, _schema: unknown, next: Handler) => {
				handler = next;
			},
		} as never);
		const result = await handler!({ threshold: 0 });
		expect(result.isError).toBe(true);
	});
});
