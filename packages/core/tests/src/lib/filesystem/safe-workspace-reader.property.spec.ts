import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	SafeWorkspaceReader,
	WorkspaceContainmentError,
} from '@mcp-vertex/core/public';

describe('SafeWorkspaceReader property checks', () => {
	let workspaceRoot = '';
	let outsideRoot = '';
	let reader: SafeWorkspaceReader;

	beforeEach(() => {
		workspaceRoot = mkdtempSync(join(tmpdir(), 'safe-reader-prop-ws-'));
		outsideRoot = mkdtempSync(join(tmpdir(), 'safe-reader-prop-out-'));
		mkdirSync(join(workspaceRoot, 'src'), { recursive: true });
		writeFileSync(
			join(workspaceRoot, 'src', 'ok.ts'),
			'export const ok = true;',
		);
		reader = new SafeWorkspaceReader(workspaceRoot);
	});

	afterEach(() => {
		rmSync(workspaceRoot, { recursive: true, force: true });
		rmSync(outsideRoot, { recursive: true, force: true });
	});

	it('rejects every generated traversal depth that escapes the workspace', () => {
		for (let depth = 1; depth <= 24; depth += 1) {
			const attempt = `${'../'.repeat(depth)}secret.ts`;
			expect(() => reader.resolve(attempt)).toThrow(
				WorkspaceContainmentError,
			);
		}
	});

	it('rejects every reserved-path shape generated from the default reserved roots', () => {
		for (const reserved of ['.git', '.env', 'node_modules']) {
			for (const attempt of [
				reserved,
				`${reserved}/x`,
				`src/../${reserved}`,
			]) {
				expect(() => reader.resolve(attempt)).toThrow(
					WorkspaceContainmentError,
				);
			}
		}
	});

	it('rejects every generated absolute sibling path outside the workspace', () => {
		for (let index = 0; index < 20; index += 1) {
			const attempt = resolve(outsideRoot, `secret-${index}.ts`);
			expect(() => reader.resolve(attempt)).toThrow(
				WorkspaceContainmentError,
			);
		}
	});
});
