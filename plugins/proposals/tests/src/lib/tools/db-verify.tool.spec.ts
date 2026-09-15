/**
 * db-verify.tool.spec.ts — the `proposals_db_verify` tool as an MCP host
 * reaches it: the runner that forwards the requested source commit, and
 * the registered handler under the default and a host namespace.
 *
 * The real verifier rebuilds a temporary SQLite projection, which needs
 * `bun:sqlite`; its own behaviour is covered under `bun test`. Here the
 * verifier is injected so the tool layer is pinned in vitest.
 */
import { createFakeToolServer } from '@delendai/test-kit/public';
import { describe, expect, it } from 'vitest';

import type {
	IDbVerifyInput,
	IDbVerifyOutput,
} from '../../../../src/lib/services/db-verify';
import {
	DB_VERIFY_REGISTRATION_ID,
	buildDbVerifyToolRegistration,
	dbVerifyOutputSchema,
	runDbVerifyTool,
} from '../../../../src/lib/tools/db-verify.tool';

const OUTPUT: IDbVerifyOutput = {
	digestBefore: null,
	digestAfter: 'digest-after',
	match: false,
	durationMs: 3,
	sourceCommit: 'deadbee',
};

const recordingVerifier = () => {
	const calls: IDbVerifyInput[] = [];
	const verify = (input: IDbVerifyInput): IDbVerifyOutput => {
		calls.push(input);
		return OUTPUT;
	};
	return { calls, verify };
};

const registerWith = async (
	options: Parameters<typeof buildDbVerifyToolRegistration>[0],
) => {
	const registered: Array<{
		name: string;
		handler: (args: unknown) => unknown;
	}> = [];
	await buildDbVerifyToolRegistration(options).register(
		createFakeToolServer({
			onRegisterTool: ({ name, handler }) => {
				registered.push({ name, handler });
			},
		}),
	);
	return registered;
};

describe('runDbVerifyTool', () => {
	it('passes the requested source commit to the verifier', () => {
		const verifier = recordingVerifier();

		const output = runDbVerifyTool(
			{
				workspaceRoot: '/ws',
				proposalsDirAbs: '/ws/docs/delendai/proposals',
				verify: verifier.verify,
			},
			{ sourceCommit: 'cafe123' },
		);

		expect(output).toEqual(OUTPUT);
		expect(verifier.calls[0]?.sourceCommit).toBe('cafe123');
	});

	it('leaves the source commit to the verifier when none is requested', () => {
		const verifier = recordingVerifier();

		runDbVerifyTool(
			{
				workspaceRoot: '/ws',
				proposalsDirAbs: '/ws/docs/delendai/proposals',
				verify: verifier.verify,
			},
			{},
		);

		expect(verifier.calls[0]).not.toHaveProperty('sourceCommit');
		expect(verifier.calls[0]?.workspaceRoot).toBe('/ws');
	});
});

describe('proposals_db_verify registration', () => {
	it('registers under the default prefix and answers through the verifier', async () => {
		const verifier = recordingVerifier();
		const registration = buildDbVerifyToolRegistration({
			workspaceRoot: '/ws',
			proposalsDirAbs: '/ws/docs/delendai/proposals',
			verify: verifier.verify,
		});
		const registered = await registerWith({
			workspaceRoot: '/ws',
			proposalsDirAbs: '/ws/docs/delendai/proposals',
			verify: verifier.verify,
		});

		expect(registration.id).toBe(DB_VERIFY_REGISTRATION_ID);
		expect(registered.map((tool) => tool.name)).toEqual([
			'proposals_proposals_db_verify',
		]);
		const result = (await registered[0]!.handler(undefined)) as {
			structuredContent?: unknown;
		};
		expect(
			dbVerifyOutputSchema.parse(result.structuredContent),
		).toMatchObject({ ok: true, match: false, sourceCommit: 'deadbee' });
	});

	it('uses the host namespace and parses the arguments it receives', async () => {
		const verifier = recordingVerifier();
		const registered = await registerWith({
			workspaceRoot: '/ws',
			proposalsDirAbs: '/ws/docs/delendai/proposals',
			namespacePrefix: 'work',
			verify: verifier.verify,
		});

		expect(registered[0]?.name).toBe('work_proposals_db_verify');
		await registered[0]!.handler({ sourceCommit: 'cafe123' });
		expect(verifier.calls[0]?.sourceCommit).toBe('cafe123');
	});
});
