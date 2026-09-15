/**
 * conflicts.tool.spec.ts — the `proposals_conflicts` tool as an MCP host
 * reaches it. The conflict query itself is covered by the service spec;
 * here the registered handler answers on a workspace with no database,
 * which the service reports as no conflicts before opening SQLite.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { withOkEnvelope } from '@delendai/core/plugin';
import { createFakeToolServer } from '@delendai/test-kit/public';
import { afterEach, describe, expect, it } from 'vitest';

import {
	buildConflictsToolRegistration,
	conflictsOutputSchema,
} from '../../../../src/lib/tools/conflicts.tool';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const registerWith = async (
	options: Parameters<typeof buildConflictsToolRegistration>[0],
) => {
	const registered: Array<{
		name: string;
		handler: (args: unknown) => unknown;
	}> = [];
	await buildConflictsToolRegistration(options).register(
		createFakeToolServer({
			onRegisterTool: ({ name, handler }) => {
				registered.push({ name, handler });
			},
		}),
	);
	return registered;
};

describe('proposals_conflicts registration', () => {
	it('lists no conflicts through the registered handler when there is no database', async () => {
		const root = mkdtempSync(join(tmpdir(), 'conflicts-tool-'));
		roots.push(root);
		const registered = await registerWith({ workspaceRoot: root });

		expect(registered.map((tool) => tool.name)).toEqual([
			'proposals_proposals_conflicts',
		]);
		const result = (await registered[0]!.handler({})) as {
			structuredContent?: unknown;
		};
		// Strict, as a client that listed tools validates it.
		expect(
			withOkEnvelope(conflictsOutputSchema)
				.strict()
				.parse(result.structuredContent),
		).toMatchObject({ ok: true, conflicts: [] });
	});

	it('uses the host namespace prefix', async () => {
		const root = mkdtempSync(join(tmpdir(), 'conflicts-tool-'));
		roots.push(root);
		const registered = await registerWith({
			workspaceRoot: root,
			namespacePrefix: 'work',
		});

		expect(registered[0]?.name).toBe('work_proposals_conflicts');
	});
});
