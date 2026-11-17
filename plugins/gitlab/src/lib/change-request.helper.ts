/**
 * change-request.ts — a GitLab merge request, as the core reads and
 * rewrites it (x01023). The core owns the contract
 * (`IChangeRequestForge`); this is the GitLab side of it, through the
 * authenticated `glab` CLI's API passthrough (`:id` is the project of the
 * checkout's remote).
 */
import type {
	IChangeRequestForge,
	IChangeRequestRef,
	IChangeRequestText,
} from '@delendai/core/contracts';

/** `gitlab.com` and self-hosted hosts named `gitlab.*`, over https, ssh or scp. */
const GITLAB_REMOTE =
	/^(?:(?:https?|ssh|git):\/\/(?:[^@/]+@)?|[^@/:]+@)gitlab\.[^:/]+[:/]/u;

const requestPath = (ref: IChangeRequestRef): string =>
	`projects/:id/merge_requests/${ref.id}`;

export const gitlabChangeRequestForge: IChangeRequestForge = {
	id: 'gitlab',
	handles: (remoteUrl) => GITLAB_REMOTE.test(remoteUrl),
	findOpen: (run, branch) => {
		const found = run.json('glab', [
			'api',
			`projects/:id/merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}`,
		]);
		const first: unknown = Array.isArray(found) ? found[0] : undefined;
		if (typeof first !== 'object' || first === null) return undefined;
		const { web_url, iid } = first as {
			readonly web_url?: unknown;
			readonly iid?: unknown;
		};
		return typeof web_url === 'string' && typeof iid === 'number'
			? { url: web_url, id: String(iid) }
			: undefined;
	},
	read: (run, ref): IChangeRequestText | undefined => {
		const mr = run.json('glab', ['api', requestPath(ref)]);
		if (typeof mr !== 'object' || mr === null) return undefined;
		const { title, description } = mr as {
			readonly title?: unknown;
			readonly description?: unknown;
		};
		return typeof title === 'string'
			? {
					title,
					body: typeof description === 'string' ? description : '',
				}
			: undefined;
	},
	update: (run, ref, text) => {
		const updated = run.json('glab', [
			'api',
			'-X',
			'PUT',
			requestPath(ref),
			'-f',
			`title=${text.title}`,
			'-f',
			`description=${text.body}`,
		]);
		return typeof updated === 'object' && updated !== null;
	},
};
