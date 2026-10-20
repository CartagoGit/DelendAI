import { mkdtemp, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rootUrl = pathToFileURL(`${process.cwd()}/`);
const { buildGitLabToolRegistrations } = await import(
	new URL('plugins/gitlab/src/lib/tools/shared.ts', rootUrl).href
);

const temp = await mkdtemp(join(tmpdir(), 'gitlab-artifact-audit-'));
const pluginTempDir = join(temp, 'plugin-cache');
const outsideDir = join(temp, 'outside');
await mkdir(join(pluginTempDir, 'artifacts'), { recursive: true });
await mkdir(outsideDir, { recursive: true });
await symlink(outsideDir, join(pluginTempDir, 'artifacts', '1'));

const registrations = buildGitLabToolRegistrations({
	namespacePrefix: 'gitlab',
	context: {
		provider: 'gitlab',
		token: 'fixture',
		apiBaseUrl: 'https://gitlab.example/api/v4',
		webBaseUrl: 'https://gitlab.example',
		host: 'gitlab.example',
		project: null,
		timeoutMs: 15000,
		maxRetries: 0,
		retryBaseDelayMs: 0,
		sources: {
			token: 'env:GITLAB_TOKEN',
			apiBaseUrl: 'default',
			webBaseUrl: 'default',
			project: [],
		},
	},
	client: {
		request: async () => ({
			data: Uint8Array.from([112, 119, 110]).buffer,
			meta: {
				status: 200,
				requestId: null,
				durationMs: 0,
				attempts: 1,
				pagination: null,
				rateLimit: null,
				truncated: null,
			},
		}),
	} as never,
	pluginTempDir,
});

const tools: Record<string, { handler: (args: unknown) => Promise<unknown> }> =
	{};
const server = {
	registerTool(
		name: string,
		_config: unknown,
		handler: (args: unknown) => Promise<unknown>,
	) {
		tools[name] = { handler };
	},
};
for (const registration of registrations)
	await registration.register(server as never);

const result = await tools.gitlab_artifacts!.handler({
	action: 'download',
	projectId: 1,
	jobId: 7,
	filename: 'proof.txt',
	maxBytes: 3,
});
const escapedPath = join(outsideDir, '7', 'proof.txt');
const escapedContents = await readFile(escapedPath, 'utf8');
console.log(
	JSON.stringify({ escapedWrite: true, escapedPath, escapedContents }),
);
await rm(temp, { recursive: true, force: true });
