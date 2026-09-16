/**
 * quality-containment.spec.ts — the quality tools scan and read inside
 * the workspace, and refuse a `cwd` whose real location is outside it.
 *
 * Both tools resolved `cwd` lexically, which is a string comparison:
 * `workspace/linked` never leaves the workspace as text while naming
 * another tree entirely. Complexity would have scanned that tree's
 * sources; coverage would have read its report.
 *
 * These cases use a REAL temporary workspace rather than the in-memory
 * reader the sibling specs use, because a physical check has nothing to
 * resolve against a fake filesystem — the test would pass without
 * proving anything.
 */
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
	IFileReader,
	IToolRegistration,
	IToolTextResult,
} from '@delendai/core/public';
import { createFakeToolServer } from '@delendai/test-kit/public';

import { buildQualityComplexityToolRegistration } from '../../../src/lib/tools/quality-complexity.tool';
import { buildQualityCoverageToolRegistration } from '../../../src/lib/tools/quality-coverage.tool';

type THandler = (args: unknown) => Promise<IToolTextResult>;

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

/**
 * Both tools' registrations satisfy `IToolRegistration`, so one capture
 * serves both — and the fake server comes from the test-kit rather than
 * a cast, which is what `lint:test-unsafe-casts` asks for.
 */
const capture = async (registration: IToolRegistration): Promise<THandler> => {
	let handler: THandler | undefined;
	await registration.register(
		createFakeToolServer({
			onRegisterTool: (call) => {
				handler = call.handler as THandler;
			},
		}),
	);
	if (!handler) throw new Error('no handler registered');
	return handler;
};

describe('quality tools refuse a cwd outside the workspace', () => {
	let parent = '';
	let workspace = '';
	let outside = '';

	beforeEach(() => {
		parent = mkdtempSync(join(tmpdir(), 'quality-containment-'));
		workspace = join(parent, 'workspace');
		outside = join(parent, 'outside');
		mkdirSync(workspace, { recursive: true });
		mkdirSync(outside, { recursive: true });
		// A complex function the scanner would report if it ever looked.
		write(
			outside,
			'src/secret.ts',
			'export const secret = (n: number) => { if (n) { if (n > 1) { if (n > 2) { return 1; } } } return 0; };',
		);
		symlinkSync(outside, join(workspace, 'linked'), 'dir');
	});

	afterEach(() => {
		rmSync(parent, { recursive: true, force: true });
	});

	it('complexity refuses a cwd reached through an escaping symlink', async () => {
		const handler = await capture(
			buildQualityComplexityToolRegistration({
				namespacePrefix: 'quality',
				reader: noopReader,
				workspaceRoot: workspace,
				run: async () => ({ code: 0, output: '', timedOut: false }),
			}),
		);

		const result = await handler({ threshold: 1, cwd: 'linked' });

		expect(result.isError).toBe(true);
		// The outside tree's function must not appear in the output.
		expect(JSON.stringify(result)).not.toContain('secret');
	});

	it('complexity still scans a cwd that really is inside', async () => {
		write(workspace, 'src/inside.ts', 'export const inside = 1;\n');
		const handler = await capture(
			buildQualityComplexityToolRegistration({
				namespacePrefix: 'quality',
				reader: noopReader,
				workspaceRoot: workspace,
				run: async () => ({ code: 0, output: '', timedOut: false }),
			}),
		);

		const result = await handler({ threshold: 1, cwd: '.' });

		expect(result.isError).toBeFalsy();
	});

	it('coverage refuses a cwd reached through an escaping symlink', async () => {
		const handler = await capture(
			buildQualityCoverageToolRegistration({
				namespacePrefix: 'quality',
				reader: noopReader,
				workspaceRoot: workspace,
				run: async () => ({ code: 0, output: '', timedOut: false }),
			}),
		);

		const result = await handler({ scope: 'all', cwd: 'linked' });

		expect(result.isError).toBe(true);
	});
});
