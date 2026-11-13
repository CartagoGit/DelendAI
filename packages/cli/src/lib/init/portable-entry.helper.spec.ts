import { describe, expect, it } from 'vitest';

import { entryFromWorkspace } from './portable-entry.helper';

describe('entryFromWorkspace', () => {
	it('writes the entry relative to the workspace, inside it or beside it', () => {
		expect(
			entryFromWorkspace(
				'/srv/a/work/app',
				'/srv/a/work/app/node_modules/@delendai/core/tools/scripts/host/host-server.script.ts',
			),
		).toBe(
			'${workspaceFolder}/node_modules/@delendai/core/tools/scripts/host/host-server.script.ts',
		);
		expect(
			entryFromWorkspace(
				'/srv/a/work/app',
				'/srv/a/work/delendai/tools/scripts/host/host-server.script.ts',
			),
		).toBe(
			'${workspaceFolder}/../delendai/tools/scripts/host/host-server.script.ts',
		);
	});

	it('keeps an entry that cannot be reached from the workspace as it is', () => {
		expect(entryFromWorkspace('/srv/a/app', '/srv/a/app')).toBe(
			'/srv/a/app',
		);
	});
});
