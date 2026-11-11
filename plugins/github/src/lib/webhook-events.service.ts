/**
 * webhook-events.service.ts — GitHub's half of the forge event port: it
 * checks a delivery's signature and maps GitHub's payloads to the
 * forge-neutral events, so nothing downstream reads a GitHub field.
 *
 * Every payload is read defensively: a field that is missing or of another
 * type yields a drop with a reason, never an exception, because the forge
 * decides what it sends and may send something new tomorrow.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import {
	GITHUB_BOT_SENDER_TYPE,
	GITHUB_SIGNATURE_BITS,
	GITHUB_SIGNATURE_PREFIX,
	GITHUB_WEBHOOK_HEADERS,
} from './contracts/constants/github-webhook.constant';

import type {
	IForgeEvent,
	IForgeEventAdapter,
	IForgeEventDelivery,
	IForgeEventMapping,
	IForgePrChange,
} from '@delendai/forge/public';

type IRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is IRecord =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const record = (value: unknown, key: string): IRecord | undefined => {
	if (!isRecord(value)) return undefined;
	const inner = value[key];
	return isRecord(inner) ? inner : undefined;
};

const text = (value: unknown, key: string): string | undefined => {
	if (!isRecord(value)) return undefined;
	const inner = value[key];
	return typeof inner === 'string' ? inner : undefined;
};

const count = (value: unknown, key: string): number | undefined => {
	if (!isRecord(value)) return undefined;
	const inner = value[key];
	return typeof inner === 'number' ? inner : undefined;
};

const labelNames = (value: unknown): readonly string[] | undefined => {
	if (!isRecord(value)) return undefined;
	const labels = value.labels;
	if (!Array.isArray(labels)) return undefined;
	return labels.flatMap((label: unknown) => {
		const name = text(label, 'name');
		return name === undefined ? [] : [name];
	});
};

const one = (event: IForgeEvent): IForgeEventMapping => ({
	events: [event],
});

const unmapped = (name: string, action?: string): IForgeEventMapping => ({
	dropped: `unmapped:${name}${action === undefined ? '' : `.${action}`}`,
});

/** The fields every event of a delivery shares: repository and sender. */
const common = (
	payload: unknown,
): Pick<IForgeEvent, 'repository' | 'actor'> | undefined => {
	const repository = text(record(payload, 'repository'), 'full_name');
	if (repository === undefined) return undefined;
	const sender = record(payload, 'sender');
	const login = text(sender, 'login');
	return {
		repository,
		actor:
			login === undefined
				? undefined
				: {
						name: login,
						bot: text(sender, 'type') === GITHUB_BOT_SENDER_TYPE,
					},
	};
};

const PR_UPDATES: Readonly<Record<string, IForgePrChange>> = {
	synchronize: 'synchronized',
	labeled: 'labelled',
	unlabeled: 'unlabelled',
	edited: 'edited',
	converted_to_draft: 'drafted',
};

const ISSUE_UPDATES: Readonly<Record<string, IForgePrChange | undefined>> = {
	edited: 'edited',
	reopened: 'reopened',
	labeled: 'labelled',
	unlabeled: 'unlabelled',
	assigned: undefined,
	unassigned: undefined,
	milestoned: undefined,
	demilestoned: undefined,
};

const pullRequest = (
	payload: unknown,
	base: Pick<IForgeEvent, 'repository' | 'actor'>,
): IForgeEventMapping => {
	const action = text(payload, 'action');
	const pr = record(payload, 'pull_request');
	const fields = {
		...base,
		number: count(pr, 'number') ?? count(payload, 'number'),
		branch: text(record(pr, 'head'), 'ref'),
		base: text(record(pr, 'base'), 'ref'),
		sha: text(record(pr, 'head'), 'sha'),
		labels: labelNames(pr),
	};
	switch (action) {
		case 'opened':
			return one({ kind: 'pr.opened', ...fields });
		case 'reopened':
			return one({ kind: 'pr.opened', change: 'reopened', ...fields });
		case 'ready_for_review':
			return one({ kind: 'pr.ready', ...fields });
		case 'closed':
			return one({
				kind: pr?.merged === true ? 'pr.merged' : 'pr.closed',
				...fields,
			});
		default: {
			const change =
				action === undefined ? undefined : PR_UPDATES[action];
			if (change === undefined) return unmapped('pull_request', action);
			return one({
				kind: 'pr.updated',
				change,
				label: text(record(payload, 'label'), 'name'),
				...fields,
			});
		}
	}
};

const checkRun = (
	payload: unknown,
	base: Pick<IForgeEvent, 'repository' | 'actor'>,
): IForgeEventMapping => {
	const action = text(payload, 'action');
	if (action !== 'completed') return unmapped('check_run', action);
	const run = record(payload, 'check_run');
	const pulls = isRecord(run) ? run.pull_requests : undefined;
	const first: unknown = Array.isArray(pulls) ? pulls[0] : undefined;
	return one({
		kind: 'check.completed',
		...base,
		number: count(first, 'number'),
		branch: text(record(run, 'check_suite'), 'head_branch'),
		sha: text(run, 'head_sha'),
		check: text(run, 'name'),
		conclusion: text(run, 'conclusion'),
	});
};

const review = (
	payload: unknown,
	base: Pick<IForgeEvent, 'repository' | 'actor'>,
): IForgeEventMapping => {
	const action = text(payload, 'action');
	if (action !== 'submitted') return unmapped('pull_request_review', action);
	const pr = record(payload, 'pull_request');
	return one({
		kind: 'review.submitted',
		...base,
		number: count(pr, 'number'),
		branch: text(record(pr, 'head'), 'ref'),
		base: text(record(pr, 'base'), 'ref'),
		sha: text(record(pr, 'head'), 'sha'),
		review: text(record(payload, 'review'), 'state'),
	});
};

const issue = (
	payload: unknown,
	base: Pick<IForgeEvent, 'repository' | 'actor'>,
): IForgeEventMapping => {
	const action = text(payload, 'action');
	const found = record(payload, 'issue');
	const fields = {
		...base,
		number: count(found, 'number'),
		labels: labelNames(found),
	};
	if (action === 'opened') return one({ kind: 'issue.opened', ...fields });
	if (action === 'closed') return one({ kind: 'issue.closed', ...fields });
	if (action === undefined || !(action in ISSUE_UPDATES))
		return unmapped('issues', action);
	return one({
		kind: 'issue.updated',
		change: ISSUE_UPDATES[action],
		label: text(record(payload, 'label'), 'name'),
		...fields,
	});
};

const BRANCH_REF_PREFIX = 'refs/heads/';

const push = (
	payload: unknown,
	base: Pick<IForgeEvent, 'repository' | 'actor'>,
): IForgeEventMapping => {
	const ref = text(payload, 'ref');
	if (ref === undefined || !ref.startsWith(BRANCH_REF_PREFIX))
		return unmapped('push', 'tag');
	if (isRecord(payload) && payload.deleted === true)
		return unmapped('push', 'deleted');
	// A push's sender is the pusher; `pusher` carries no type, `sender` does.
	return one({
		kind: 'branch.pushed',
		...base,
		branch: ref.slice(BRANCH_REF_PREFIX.length),
		sha: text(payload, 'after'),
	});
};

const MAPPERS: Readonly<
	Record<
		string,
		(
			payload: unknown,
			base: Pick<IForgeEvent, 'repository' | 'actor'>,
		) => IForgeEventMapping
	>
> = {
	pull_request: pullRequest,
	check_run: checkRun,
	pull_request_review: review,
	issues: issue,
	push,
};

/** Map one parsed GitHub payload of event `name`. */
export const mapGitHubEvent = (
	name: string,
	payload: unknown,
): IForgeEventMapping => {
	const mapper = MAPPERS[name];
	if (mapper === undefined) return unmapped(name);
	const base = common(payload);
	if (base === undefined) return { dropped: `no-repository:${name}` };
	return mapper(payload, base);
};

/**
 * Whether `delivery` carries GitHub's SHA-256 signature of its body under
 * `secret`. The comparison is constant-time; neither value is ever logged.
 */
export const verifyGitHubSignature = (
	delivery: IForgeEventDelivery,
	secret: string,
): boolean => {
	const header = delivery.headers[GITHUB_WEBHOOK_HEADERS.signature];
	if (header === undefined || !header.startsWith(GITHUB_SIGNATURE_PREFIX))
		return false;
	const expected = Buffer.from(
		createHmac(`sha${String(GITHUB_SIGNATURE_BITS)}`, secret)
			.update(delivery.body)
			.digest('hex'),
	);
	const given = Buffer.from(header.slice(GITHUB_SIGNATURE_PREFIX.length));
	return given.length === expected.length && timingSafeEqual(given, expected);
};

/** GitHub's adapter for the forge event port. */
export const createGitHubEventAdapter = (): IForgeEventAdapter => ({
	forge: 'github',
	verify: verifyGitHubSignature,
	eventName: (delivery) => delivery.headers[GITHUB_WEBHOOK_HEADERS.event],
	map: mapGitHubEvent,
});
