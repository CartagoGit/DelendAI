import { describe, expect, it } from 'vitest';

import { entryFromWorkspace } from './portable-entry.helper';

describe('entryFromWorkspace', () => {
	it('writes the entry relative to the workspace, inside it or beside it', () => {
		expect(
			entryFromWorkspace(
				'/home/a/work/app',
				'/home/a/work/app/node_modules/@delendai/core/tools/scripts/host/host-server.script.ts',
			),
		).toBe(
			'${workspaceFolder}/node_modules/@delendai/core/tools/scripts/host/host-server.script.ts',
		);
		expect(
			entryFromWorkspace(
				'/home/a/work/app',
				'/home/a/work/delendai/tools/scripts/host/host-server.script.ts',
			),
		).toBe(
			'${workspaceFolder}/../delendai/tools/scripts/host/host-server.script.ts',
		);
	});

	it('keeps an entry that cannot be reached from the workspace as it is', () => {
		expect(entryFromWorkspace('/home/a/app', '/home/a/app')).toBe(
			'/home/a/app',
		);
	});
});
