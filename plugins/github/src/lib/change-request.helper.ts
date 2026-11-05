/**
 * change-request.ts — a GitHub pull request, as the core reads and
 * rewrites it (x01023). The core owns the contract
 * (`IChangeRequestForge`); this is the GitHub side of it, through the
 * authenticated `gh` CLI. The update goes through the REST endpoint: `gh
 * pr edit` lives on a GraphQL surface that aborts on the deprecated
 * Projects classic fields.
 */
import type {
	IChangeRequestForge,
	IChangeRequestRef,
	IChangeRequestText,
} from '@delendai/core/contracts';

/** `https://github.com/…`, `ssh://git@github.com/…`, `git@github.com:…`. */
const GITHUB_REMOTE =
	/^(?:(?:https?|ssh|git):\/\/(?:[^@/]+@)?|[^@/:]+@)github\.com[:/]/u;

const pullPath = (ref: IChangeRequestRef): string =>
	`repos/{owner}/{repo}/pulls/${ref.id}`;

export const githubChangeRequestForge: IChangeRequestForge = {
	id: 'github',
	handles: (remoteUrl) => GITHUB_REMOTE.test(remoteUrl),
	findOpen: (run, branch) => {
		const found = run.json('gh', [
			'pr',
			'list',
			'--head',
			branch,
			'--state',
			'open',
			'--json',
			'url,number',
		]);
		const first: unknown = Array.isArray(found) ? found[0] : undefined;
		if (typeof first !== 'object' || first === null) return undefined;
		const { url, number } = first as {
			readonly url?: unknown;
			readonly number?: unknown;
		};
		return typeof url === 'string' && typeof number === 'number'
			? { url, id: String(number) }
			: undefined;
	},
	read: (run, ref): IChangeRequestText | undefined => {
		const pair = run.json('gh', [
			'api',
			pullPath(ref),
			'--jq',
			'[.title, (.body // "")] | @json',
		]);
		return Array.isArray(pair) &&
			typeof pair[0] === 'string' &&
			typeof pair[1] === 'string'
			? { title: pair[0], body: pair[1] }
			: undefined;
	},
	update: (run, ref, text) => {
		const url = run.text('gh', [
			'api',
			'-X',
			'PATCH',
			pullPath(ref),
			'-f',
			`title=${text.title}`,
			'-f',
			`body=${text.body}`,
			'--jq',
			'.html_url',
		]);
		return url !== undefined && url !== '';
	},
};
