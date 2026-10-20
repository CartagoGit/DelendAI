import { pathToFileURL } from 'node:url';

const rootUrl = pathToFileURL(`${process.cwd()}/`);
const { createGitLabHttpClient } = await import(
	new URL('plugins/gitlab/src/lib/client.ts', rootUrl).href
);

const started = Date.now();
let aborted = false;
const client = createGitLabHttpClient(
	{
		context: {
			provider: 'gitlab',
			token: 'fixture',
			apiBaseUrl: 'https://gitlab.example/api/v4',
			webBaseUrl: 'https://gitlab.example',
			host: 'gitlab.example',
			project: null,
			timeoutMs: 5,
			maxRetries: 0,
			retryBaseDelayMs: 0,
			sources: {
				token: 'env:GITLAB_TOKEN',
				apiBaseUrl: 'default',
				webBaseUrl: 'default',
				project: [],
			},
		},
	},
	{
		fetchFn: async (_url, init) => {
			init.signal.addEventListener('abort', () => {
				aborted = true;
			});
			return {
				ok: true,
				status: 200,
				headers: { get: () => null },
				text: async () =>
					new Promise<string>((resolve) =>
						setTimeout(() => resolve('{"ok":true}'), 80),
					),
			};
		},
	},
);

const result = await client.request({ path: '/projects/1' });
console.log(
	JSON.stringify({
		elapsedMs: Date.now() - started,
		aborted,
		result: result.data,
	}),
);
