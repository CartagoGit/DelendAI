/**
 * forge-event-store.service.ts — where the forge's events and the sessions
 * waiting on them meet, across every server of a workspace.
 *
 * Only the server holding the maintenance lease hears the forge; every
 * server serves a session that may be waiting. So the holder writes each
 * event as its own file, and each server's notification bridge watches the
 * directory: a file appearing is the event, with no server asking anyone.
 *
 * Subscriptions are one small file. `work publish` and `work deliver` add
 * the publishing agent's pull request; a session adds its own through the
 * notification tools. Nothing here is a credential.
 */

import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
	FORGE_EVENT_MAX_SUBSCRIPTIONS,
	FORGE_EVENT_RECORDS_DIR,
	FORGE_EVENT_RETENTION_MS,
	FORGE_EVENT_SUBSCRIPTIONS_FILE,
	FORGE_EVENTS_DIR,
} from '../contracts/constants/forge-event-store.constant';
import { writeFileAtomic } from '../shared/atomic-write';
import { withFileMutex } from '../shared/with-file-mutex';
import { readWorkspaceCacheDir } from '../work-units/development-policy.service';

import type {
	IForgeEventRecord,
	IForgeEventRecordEvent,
	IForgeEventSubscription,
	IForgePullRequestAddress,
} from '../contracts/interfaces/forge-event-store.interface';
import type { IPublicationPullRequest } from '../contracts/interfaces/publication-pull-request.interface';

const NAME_SUFFIX_BYTES = 4;
const RECORD_EXTENSION = '.json';

/** The shared store of a workspace whose cache is `cacheDir`. */
export const forgeEventsDir = (root: string, cacheDir: string): string =>
	join(root, cacheDir, FORGE_EVENTS_DIR);

/** The directory event files appear in. */
export const forgeEventRecordsDir = (dir: string): string =>
	join(dir, FORGE_EVENT_RECORDS_DIR);

const subscriptionsPath = (dir: string): string =>
	join(dir, FORGE_EVENT_SUBSCRIPTIONS_FILE);

const isSubscription = (value: unknown): value is IForgeEventSubscription => {
	if (typeof value !== 'object' || value === null) return false;
	const entry = value as Partial<
		Record<keyof IForgeEventSubscription, unknown>
	>;
	return (
		typeof entry.agent === 'string' &&
		typeof entry.repository === 'string' &&
		typeof entry.number === 'number' &&
		typeof entry.since === 'number'
	);
};

/** Every subscription; none when the file is missing or unreadable. */
export const readForgeEventSubscriptions = async (
	dir: string,
): Promise<readonly IForgeEventSubscription[]> => {
	try {
		const parsed: unknown = JSON.parse(
			await readFile(subscriptionsPath(dir), 'utf8'),
		);
		return Array.isArray(parsed) ? parsed.filter(isSubscription) : [];
	} catch {
		return [];
	}
};

const sameTarget = (
	a: Pick<IForgeEventSubscription, 'repository' | 'number'>,
	b: Pick<IForgeEventSubscription, 'repository' | 'number'>,
): boolean => a.repository === b.repository && a.number === b.number;

const rewrite = async (
	dir: string,
	change: (
		current: readonly IForgeEventSubscription[],
	) => readonly IForgeEventSubscription[],
): Promise<void> => {
	await mkdir(dir, { recursive: true });
	const path = subscriptionsPath(dir);
	await withFileMutex(
		path,
		async () => {
			const next = change(await readForgeEventSubscriptions(dir));
			await writeFileAtomic(
				path,
				`${JSON.stringify(next, null, '\t')}\n`,
			);
		},
		{ onContention: 'wait' },
	);
};

/** Subscribe, once per agent and target; the oldest go past the bound. */
export const addForgeEventSubscription = async (
	dir: string,
	subscription: IForgeEventSubscription,
): Promise<void> => {
	await rewrite(dir, (current) =>
		[
			...current.filter(
				(entry) =>
					!(
						entry.agent === subscription.agent &&
						sameTarget(entry, subscription)
					),
			),
			subscription,
		].slice(-FORGE_EVENT_MAX_SUBSCRIPTIONS),
	);
};

/**
 * Write one event as its own file, and remove the files older than the
 * retention: a write is the only moment the store is tidied, so nothing
 * runs on a timer. Returns the file's name.
 */
export const appendForgeEventRecord = async (
	dir: string,
	event: IForgeEventRecordEvent,
	now: number = Date.now(),
): Promise<string> => {
	const records = forgeEventRecordsDir(dir);
	await mkdir(records, { recursive: true });
	const name = `${String(now)}-${randomBytes(NAME_SUFFIX_BYTES).toString('hex')}${RECORD_EXTENSION}`;
	const record: IForgeEventRecord = { at: now, event };
	await writeFileAtomic(join(records, name), JSON.stringify(record));
	for (const entry of await readdir(records)) {
		const written = Number.parseInt(entry, 10);
		if (
			Number.isFinite(written) &&
			now - written > FORGE_EVENT_RETENTION_MS
		)
			await rm(join(records, entry), { force: true });
	}
	return name;
};

/** The record in file `name`, or `undefined` when it is not one (yet). */
export const readForgeEventRecord = async (
	dir: string,
	name: string,
): Promise<IForgeEventRecord | undefined> => {
	if (!name.endsWith(RECORD_EXTENSION)) return undefined;
	try {
		const parsed: unknown = JSON.parse(
			await readFile(join(forgeEventRecordsDir(dir), name), 'utf8'),
		);
		if (typeof parsed !== 'object' || parsed === null) return undefined;
		const record = parsed as Partial<
			Record<keyof IForgeEventRecord, unknown>
		>;
		return typeof record.at === 'number' && 'event' in record
			? { at: record.at, event: record.event }
			: undefined;
	} catch {
		return undefined;
	}
};

/**
 * The repository and number of a pull request's web address, on GitHub
 * (`/owner/name/pull/7`) or GitLab (`/group/name/-/merge_requests/7`).
 */
export const pullRequestOfUrl = (
	url: string,
): IForgePullRequestAddress | undefined => {
	const match =
		/^[a-z]+:\/\/[^/]+\/(.+?)\/(?:pull|-\/merge_requests)\/(\d+)\/?$/u.exec(
			url.trim(),
		);
	if (match === null) return undefined;
	return { repository: match[1] ?? '', number: Number(match[2]) };
};

/**
 * Subscribe `agent` to the pull request `work publish` opened for it in the
 * workspace at `root`, so the agent can wait for its outcome instead of
 * asking. Never fails the caller; returns whether it subscribed.
 */
export const subscribeAgentToPullRequest = async (input: {
	readonly root: string;
	readonly agent: string;
	readonly pullRequest: IPublicationPullRequest | undefined;
	readonly now?: number | undefined;
}): Promise<boolean> => {
	const { pullRequest } = input;
	if (pullRequest === undefined || !('url' in pullRequest)) return false;
	const target = pullRequestOfUrl(pullRequest.url);
	if (target === undefined) return false;
	try {
		await addForgeEventSubscription(
			forgeEventsDir(input.root, await readWorkspaceCacheDir(input.root)),
			{ agent: input.agent, ...target, since: input.now ?? Date.now() },
		);
		return true;
	} catch {
		return false;
	}
};
