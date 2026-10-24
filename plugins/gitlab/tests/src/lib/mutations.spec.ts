import { describe, expect, it } from 'vitest';

import type {
	IRemoteFetchResponse,
	RemoteFetchFn,
} from '@delendai/remote-provider-core';

import { createGitLabMutationAdapter } from '../../../src/lib/mutations';
import { buildGitLabWriteToolRegistrations } from '../../../src/lib/tools/write-tools';

type ToolHandler = (args: unknown) => Promise<unknown>;

type ToolRegistration = {
	handler: ToolHandler;
	meta: {
		inputSchema?: { safeParse: (value: unknown) => { success: boolean } };
		outputSchema?: { safeParse: (value: unknown) => { success: boolean } };
	};
};

class FakeServer {
	tools: Record<string, ToolRegistration> = {};

	registerTool(
		name: string,
		meta: ToolRegistration['meta'],
		handler: ToolHandler,
	) {
		this.tools[name] = { handler, meta };
	}
}

const getTool = (
	tools: Record<string, ToolRegistration>,
	name: string,
): ToolRegistration => {
	const tool = tools[name];
	if (tool === undefined) {
		throw new Error(`Missing tool registration: ${name}`);
	}
	return tool;
};

const headersOf = (
	values: Readonly<Record<string, string>> = {},
): IRemoteFetchResponse['headers'] => ({
	get(name: string) {
		const found = Object.entries(values).find(
			([key]) => key.toLowerCase() === name.toLowerCase(),
		);
		return found?.[1] ?? null;
	},
});

const response = (
	status: number,
	body: string,
	headers: Readonly<Record<string, string>> = {},
): IRemoteFetchResponse => ({
	ok: status >= 200 && status < 300,
	status,
	headers: headersOf(headers),
	text: async () => body,
});

const parseToolJson = (result: unknown): Record<string, unknown> => {
	const text =
		(result as { content?: Array<{ text?: string }> }).content?.[0]?.text ??
		'{}';
	return JSON.parse(text) as Record<string, unknown>;
};

const createAdapter = (fetchFn: RemoteFetchFn) =>
	createGitLabMutationAdapter(
		{
			context: {
				provider: 'gitlab',
				token: 'secret-token',
				apiBaseUrl: 'https://gitlab.example/api/v4',
				webBaseUrl: 'https://gitlab.example',
				host: 'gitlab.example',
				project: {
					provider: 'gitlab',
					host: 'gitlab.example',
					projectPath: 'group/repo',
					displayName: 'group/repo',
					webUrl: 'https://gitlab.example/group/repo',
					apiUrl: 'https://gitlab.example/api/v4/projects/group%2Frepo',
				},
				timeoutMs: 15_000,
				maxRetries: 0,
				retryBaseDelayMs: 250,
				sources: {
					token: 'env:GITLAB_TOKEN',
					apiBaseUrl: 'default',
					webBaseUrl: 'default',
					project: ['plugin'],
				},
			},
			nowIso: () => '2026-08-31T12:00:00.000Z',
		},
		{ fetchFn },
	);

describe('gitlab mutable adapters (f00413 S2)', () => {
	it('rejects missing confirm before creating an issue comment', async () => {
		let calls = 0;
		const adapter = createAdapter(async () => {
			calls += 1;
			return response(201, JSON.stringify({ id: 1 }));
		});

		const result = await adapter.createIssueComment({
			actor: 'copilot',
			iid: 17,
			body: 'comment with secret-token',
		});

		expect(calls).toBe(0);
		expect(result).toMatchObject({
			ok: false,
			outcome: 'rejected',
			error: { code: 'confirmation-required' },
			audit: {
				provider: 'gitlab',
				resource: 'group/repo#issue:17:comment',
				remote: { attempts: 0, duplicate: false },
			},
		});
	});

	it('creates issue comments with a redacted audit trail and the GitLab notes endpoint', async () => {
		const seen: Array<{ url: string; method: string; body?: string }> = [];
		const adapter = createAdapter(async (url, init) => {
			const entry: { url: string; method: string; body?: string } = {
				url,
				method: init.method,
			};
			if (init.body !== undefined) entry.body = init.body;
			seen.push(entry);
			return response(
				201,
				JSON.stringify({
					id: 9,
					body: 'please rotate secret-token now',
					created_at: '2026-08-31T12:00:00Z',
					updated_at: '2026-08-31T12:00:01Z',
					system: false,
					author: {
						name: 'Ada',
						username: 'ada',
						web_url: 'https://gitlab.example/ada',
					},
				}),
				{ 'x-request-id': 'req-note' },
			);
		});

		const result = await adapter.createIssueComment({
			actor: 'copilot',
			confirm: true,
			iid: 17,
			body: 'please rotate secret-token now',
		});

		expect(seen).toEqual([
			{
				url: 'https://gitlab.example/api/v4/projects/group%2Frepo/issues/17/notes',
				method: 'POST',
				body: JSON.stringify({
					body: 'please rotate secret-token now',
				}),
			},
		]);
		expect(result).toMatchObject({
			ok: true,
			outcome: 'applied',
			audit: {
				details: {
					project: 'group/repo',
					iid: '17',
					bodyLength: 30,
				},
				remote: {
					requestId: 'req-note',
					status: 201,
				},
			},
		});
	});

	it('replies to merge request discussions through the discussion notes endpoint', async () => {
		const seen: string[] = [];
		const adapter = createAdapter(async (url) => {
			seen.push(url);
			return response(
				201,
				JSON.stringify({
					id: 22,
					body: 'reply',
					created_at: '2026-08-31T12:00:00Z',
					updated_at: '2026-08-31T12:00:01Z',
					system: false,
					author: {
						name: 'Linus',
						username: 'linus',
						web_url: 'https://gitlab.example/linus',
					},
				}),
			);
		});

		const result = await adapter.replyMergeRequestDiscussion({
			actor: 'copilot',
			confirm: true,
			iid: 8,
			discussionId: 'discussion-1',
			body: 'reply',
		});

		expect(seen).toEqual([
			'https://gitlab.example/api/v4/projects/group%2Frepo/merge_requests/8/discussions/discussion-1/notes',
		]);
		expect(result).toMatchObject({ ok: true, outcome: 'applied' });
	});

	it('classifies duplicate tag creation without retrying', async () => {
		let calls = 0;
		const adapter = createAdapter(async () => {
			calls += 1;
			return response(
				409,
				JSON.stringify({ message: 'Tag v1.2.3 already exists' }),
				{
					'x-request-id': 'req-tag-dup',
				},
			);
		});

		const result = await adapter.createTag({
			actor: 'copilot',
			confirm: true,
			tagName: 'v1.2.3',
			ref: 'main',
		});

		expect(calls).toBe(1);
		expect(result).toMatchObject({
			ok: true,
			outcome: 'duplicate',
			duplicate: { message: 'tag already exists remotely' },
			audit: {
				remote: {
					duplicate: true,
					requestId: 'req-tag-dup',
					status: 409,
				},
			},
		});
	});

	it('classifies duplicate release creation without retrying', async () => {
		let calls = 0;
		const adapter = createAdapter(async () => {
			calls += 1;
			return response(
				409,
				JSON.stringify({
					message:
						'Release v1.2.3 has already been taken secret-token',
				}),
				{
					'x-request-id': 'req-release-dup',
				},
			);
		});

		const result = await adapter.createRelease({
			actor: 'copilot',
			confirm: true,
			tagName: 'v1.2.3',
			name: 'v1.2.3',
			description: 'contains secret-token',
		});

		expect(calls).toBe(1);
		expect(result).toMatchObject({
			ok: true,
			outcome: 'duplicate',
			duplicate: { message: 'release already exists remotely' },
			audit: {
				remote: {
					duplicate: true,
					requestId: 'req-release-dup',
					status: 409,
				},
			},
		});
		expect(JSON.stringify(result)).not.toContain('secret-token');
	});

	it('replays retry pipeline with the default idempotency key without a second write', async () => {
		let calls = 0;
		const adapter = createAdapter(async () => {
			calls += 1;
			return response(
				200,
				JSON.stringify({
					id: 44,
					status: 'pending',
					ref: 'main',
					sha: 'abc123',
				}),
				{ 'x-request-id': 'req-pipeline-idempotent' },
			);
		});

		const args = {
			actor: 'copilot',
			confirm: true,
			id: 44,
		};
		const first = await adapter.retryPipeline(args);
		const replay = await adapter.retryPipeline(args);

		expect(calls).toBe(1);
		expect(first).toMatchObject({
			ok: true,
			outcome: 'applied',
			data: {
				id: 44,
				status: 'pending',
			},
		});
		expect(replay).toMatchObject({
			ok: true,
			outcome: 'duplicate',
			idempotentReplay: true,
			duplicate: {
				message:
					'idempotency key already completed this remote mutation',
				existing: {
					id: 44,
					status: 'pending',
				},
			},
			audit: {
				idempotency: {
					key: 'gitlab:pipeline:retry:group/repo:44',
					replay: true,
				},
				remote: {
					attempts: 1,
					duplicate: true,
					status: 200,
				},
			},
		});
	});

	it('registers the isolated write-tool surface and returns normalized outputs', async () => {
		const fetchFn: RemoteFetchFn = async (url) => {
			if (url.endsWith('/pipelines/44/retry')) {
				return response(
					200,
					JSON.stringify({
						id: 44,
						status: 'pending',
						source: 'push',
						ref: 'main',
						sha: 'abc123',
						web_url:
							'https://gitlab.example/group/repo/-/pipelines/44',
						created_at: '2026-08-31T12:00:00Z',
						updated_at: '2026-08-31T12:00:01Z',
						duration: 1,
						user: {
							name: 'Ada',
							username: 'ada',
							web_url: 'https://gitlab.example/ada',
						},
					}),
				);
			}
			return response(
				201,
				JSON.stringify({
					id: 101,
					iid: 5,
					title: 'Mutated issue',
					state: 'opened',
					web_url: 'https://gitlab.example/group/repo/-/issues/5',
					created_at: '2026-08-31T12:00:00Z',
					updated_at: '2026-08-31T12:00:01Z',
					description: 'body',
					labels: ['bug'],
					confidential: false,
					author: {
						name: 'Ada',
						username: 'ada',
						web_url: 'https://gitlab.example/ada',
					},
				}),
			);
		};
		const server = new FakeServer();
		for (const registration of buildGitLabWriteToolRegistrations({
			namespacePrefix: 'gitlab',
			context: {
				provider: 'gitlab',
				token: 'secret-token',
				apiBaseUrl: 'https://gitlab.example/api/v4',
				webBaseUrl: 'https://gitlab.example',
				host: 'gitlab.example',
				project: {
					provider: 'gitlab',
					host: 'gitlab.example',
					projectPath: 'group/repo',
					displayName: 'group/repo',
					webUrl: 'https://gitlab.example/group/repo',
					apiUrl: 'https://gitlab.example/api/v4/projects/group%2Frepo',
				},
				timeoutMs: 15_000,
				maxRetries: 0,
				retryBaseDelayMs: 250,
				sources: {
					token: 'env:GITLAB_TOKEN',
					apiBaseUrl: 'default',
					webBaseUrl: 'default',
					project: ['plugin'],
				},
			},
			mutationDeps: { fetchFn },
			nowIso: () => '2026-08-31T12:00:00.000Z',
		})) {
			await registration.register(server as never);
		}
		const issueWriteTool = getTool(server.tools, 'gitlab_issue_write');
		const pipelineWriteTool = getTool(
			server.tools,
			'gitlab_pipeline_write',
		);

		expect(Object.keys(server.tools).sort()).toEqual([
			'gitlab_discussion_write',
			'gitlab_issue_write',
			'gitlab_job_write',
			'gitlab_pipeline_write',
			'gitlab_release_write',
		]);

		const issueOutput = parseToolJson(
			await issueWriteTool.handler({
				action: 'create',
				actor: 'copilot',
				confirm: true,
				title: 'Mutated issue',
				description: 'body',
			}),
		);
		const pipelineOutput = parseToolJson(
			await pipelineWriteTool.handler({
				action: 'retry',
				actor: 'copilot',
				confirm: true,
				id: 44,
			}),
		);

		expect(issueOutput.issue).toMatchObject({
			iid: 5,
			title: 'Mutated issue',
		});
		expect(pipelineOutput.pipeline).toMatchObject({
			id: 44,
			status: 'pending',
		});
		expect(
			issueWriteTool.meta.outputSchema?.safeParse(issueOutput).success,
		).toBe(true);
		expect(
			pipelineWriteTool.meta.outputSchema?.safeParse(pipelineOutput)
				.success,
		).toBe(true);
	});
});
