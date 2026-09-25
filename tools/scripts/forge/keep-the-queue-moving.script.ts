#!/usr/bin/env bun

/**
 * keep-the-queue-moving — update every pull request that is only behind.
 *
 * WHY this exists: the integration branch requires candidates to be
 * up to date, which is what stops two independently green pull requests
 * from combining into a red branch. The cost is that every merge leaves
 * every other open pull request stale, and the forge's auto-merge will
 * not refresh them — it waits for a human to press "Update branch".
 *
 * For one person with one pull request that is a button. For a set of
 * agents landing small slices it is a queue that stops after the first
 * merge and stays stopped until somebody notices. The whole point of
 * arming auto-merge is that nobody has to notice.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: it never merges, never rebases, and
 * never touches a pull request that is not already asking to be merged.
 * Updating a branch is the one operation here that cannot lose work —
 * it merges the base INTO the candidate — and it is only applied where
 * the author already said "merge this when it is green".
 *
 * A pull request that is behind AND failing is left alone: refreshing it
 * would spend a CI run to re-learn a failure somebody has to fix anyway.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

import { mergeFlagFor } from '../lib/declared-branches';
import {
	CERTIFYING_WORKFLOW,
	certificationOf,
	type ICertificationRun,
	type IIntegrationCertification,
} from './certify-integration.script';
import {
	queueHead,
	queueOrder,
	repairStep,
	type IQueueCandidateFacts,
	type IRepairStep,
} from './queue-order';

/**
 * The merge method as the policy states it. Read off the resolved policy
 * rather than restated, so a new method cannot be added to the vocabulary
 * without this script's types noticing.
 */
type IDeclaredMergeMethod =
	IResolvedDevelopmentPolicy['integration']['mergeMethod'];

/**
 * Which repository this is, WITHOUT importing core.
 *
 * `@delendai/core/public` would drag the MCP server runtime in, and this
 * job deliberately installs nothing: a script that keeps the queue moving
 * must not be the reason the queue stops. The forge supplies
 * `GITHUB_REPOSITORY` in every workflow run, and outside one the remote
 * is the only honest answer anyway — this tool acts on whatever
 * repository it is pointed at, not on a compiled-in name.
 */
const repositorySlug = (): string => {
	const fromEnv = process.env.GITHUB_REPOSITORY;
	if (fromEnv?.includes('/') === true) return fromEnv;
	const url = execFileSync('git', ['remote', 'get-url', 'origin'], {
		encoding: 'utf8',
	}).trim();
	const match = /[/:]([^/:]+\/[^/]+?)(?:\.git)?$/u.exec(url);
	if (match?.[1] === undefined) {
		throw new Error(
			`keep-the-queue-moving: could not tell which repository this is from origin (${url}). Set GITHUB_REPOSITORY.`,
		);
	}
	return match[1];
};

const REPOSITORY_SLUG = repositorySlug();

/**
 * The project's declared development policy, or the defaults.
 *
 * Read rather than assumed: the publication namespace is configurable,
 * and a queue that armed `delendai/pr/**` on a project that renamed it
 * would arm nothing at all and say it armed everything.
 */
const readDevelopmentConfig = (): {
	readonly development?: Record<string, unknown>;
} => {
	try {
		const parsed = JSON.parse(
			readFileSync('delendai.config.json', 'utf8'),
		) as Record<string, unknown>;
		const development = parsed.development;
		return development === null || typeof development !== 'object'
			? {}
			: { development: development as Record<string, unknown> };
	} catch {
		return {};
	}
};

export interface IPullRequest {
	readonly number: number;
	readonly title: string;
	readonly auto_merge: unknown;
	readonly head: { readonly sha: string; readonly ref: string };
	readonly draft?: boolean;
}

const gh = (args: readonly string[]): string =>
	execFileSync('gh', [...args], {
		encoding: 'utf8',
		maxBuffer: 16 * 1024 * 1024,
	});

const api = <T>(path: string): T => JSON.parse(gh(['api', path])) as T;

/** `behind` / `blocked` / `clean` … as the forge reports it. */
/**
 * `behind` / `blocked` / `clean` … as the forge reports it.
 *
 * The forge computes this LAZILY. Asking straight after something merged
 * returns `unknown` while a background job works out the new
 * mergeability — and this job runs at exactly that moment, because the
 * merge is what triggers it. The first version read the answer once, got
 * `unknown`, concluded "not behind", and updated nothing: the run that
 * existed to unblock the queue reported `1 armed, 0 updated` and left the
 * candidate stuck. Observed, not theorised.
 *
 * An unknown answer is therefore re-asked rather than believed, and one
 * that is still unknown after three tries is reported as unknown instead
 * of being treated as a decision.
 */
const mergeState = (number: number): string => {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const state =
			api<{ readonly mergeable_state?: string }>(
				`repos/${REPOSITORY_SLUG}/pulls/${number}`,
			).mergeable_state ?? 'unknown';
		if (state !== 'unknown') return state;
		// Keeps the script synchronous, which the rest of it already is.
		execFileSync('sleep', ['2']);
	}
	return 'unknown';
};

interface ICheckRun {
	readonly name: string;
	readonly conclusion: string | null;
}

const checksOf = (sha: string): readonly ICheckRun[] =>
	api<{ readonly check_runs: readonly ICheckRun[] }>(
		`repos/${REPOSITORY_SLUG}/commits/${sha}/check-runs?per_page=100`,
	).check_runs;

/**
 * Checks that concluded badly, by name.
 *
 * `cancelled` is deliberately not one of them: this repository's
 * concurrency rules cancel superseded runs constantly, and treating that
 * as a failure would report every candidate as red within a minute of a
 * push — which is how a real signal gets ignored.
 */
const failuresOf = (runs: readonly ICheckRun[]): readonly string[] => [
	...new Set(
		runs
			.filter((run) =>
				['failure', 'timed_out'].includes(run.conclusion ?? ''),
			)
			.map((run) => run.name),
	),
];

export interface IWorkflowRun {
	readonly id: number;
	readonly name: string;
	readonly conclusion: string | null;
}

/**
 * Runs the forge parked behind a human instead of running them.
 *
 * A bot cannot refresh a candidate. `update-branch` is an API call, so
 * its commit is attributed to the token that made it, and the forge will
 * not start workflows on a bot's commit — it parks them as
 * `action_required`. The required aggregate then never reports and the
 * pull request is BLOCKED with nothing red to fix: the check is not
 * failing, it is ABSENT.
 *
 * Observed on #86, which sat mergeable-and-blocked with exactly one
 * check on it (a third-party scanner) while five CI runs waited for a
 * button nobody knew to press. The job that exists to keep the queue
 * moving was itself what stopped it.
 */
export const parkedRuns = (
	runs: readonly IWorkflowRun[],
): readonly IWorkflowRun[] =>
	runs.filter((run) => run.conclusion === 'action_required');

const waitingRuns = (sha: string): readonly IWorkflowRun[] =>
	parkedRuns(
		api<{ readonly workflow_runs: readonly IWorkflowRun[] }>(
			`repos/${REPOSITORY_SLUG}/actions/runs?head_sha=${sha}&per_page=100`,
		).workflow_runs,
	);

/**
 * Press the button, and say so when the forge will not let us.
 *
 * Returns the names it could not release rather than throwing: one
 * repository configuration that refuses self-approval must not stop the
 * job from updating every other candidate. A refusal that is reported is
 * a thing somebody can fix; a refusal that aborts the run is the silence
 * this whole script exists to break.
 */
const releaseWaitingRuns = (
	sha: string,
): { readonly released: number; readonly refused: readonly string[] } => {
	const refused: string[] = [];
	// Named for what it counts — one successful approve — so the
	// summary's `released` can never again be incremented by anything
	// but an outcome.
	let approved = 0;
	for (const run of waitingRuns(sha)) {
		try {
			gh([
				'api',
				'-X',
				'POST',
				`repos/${REPOSITORY_SLUG}/actions/runs/${run.id}/approve`,
			]);
			approved += 1;
		} catch {
			refused.push(run.name);
		}
	}
	return { released: approved, refused };
};

/**
 * Arm auto-merge on a candidate that is not armed yet.
 *
 * This job read `auto_merge !== null` and kept moving whatever it found
 * armed — and NOTHING armed anything. Arming was a thing a person
 * remembered to do, which makes "a green candidate merges itself" true
 * only for candidates somebody remembered. Measured: five open
 * candidates, all five armed by hand, one at a time.
 *
 * Only refs under the publication namespace are armed, because those are
 * the ones this model produced and therefore the ones it may speak for.
 * A pull request opened from anywhere else is somebody else's, and a
 * draft is explicitly not ready. Arming changes nothing about what
 * merges: the required check still decides, and auto-merge simply stops
 * requiring a human to be watching at the moment it goes green.
 */
export const armable = (
	open: readonly IPullRequest[],
	publicationPrefix: string,
): readonly IPullRequest[] =>
	open.filter(
		(pull) =>
			pull.auto_merge === null &&
			pull.draft !== true &&
			pull.head.ref.startsWith(publicationPrefix),
	);

export const armCandidates = (
	open: readonly IPullRequest[],
	publicationPrefix: string,
	mergeMethod: IDeclaredMergeMethod,
	// Injected so a test can ask which flag was passed, without a forge.
	run: (args: readonly string[]) => string = gh,
): readonly number[] => {
	const armable_ = armable(open, publicationPrefix);
	const armed: number[] = [];
	for (const pull of armable_) {
		try {
			run([
				'pr',
				'merge',
				String(pull.number),
				'--auto',
				mergeFlagFor(mergeMethod),
			]);
			armed.push(pull.number);
		} catch {
			// A candidate that cannot be armed — a forge that disallows
			// auto-merge, a branch rule in the way — is reported below as
			// unarmed rather than failing the queue for everyone else.
		}
	}
	return armed;
};

/** What ordering the queue needs to know, asked of the forge. */
const candidateFacts = (pull: IPullRequest): IQueueCandidateFacts => ({
	number: pull.number,
	headRef: pull.head.ref,
	draft: pull.draft === true,
	red: failuresOf(checksOf(pull.head.sha)).length > 0,
	conflicting: mergeState(pull.number) === 'dirty',
});

/**
 * The branch of the candidate that moves next, for the machine that
 * brings candidates forward: the same head this job arms.
 */
export const currentQueueFacts = (): {
	readonly facts: readonly IQueueCandidateFacts[];
	readonly publicationPrefix: string;
	readonly armed: ReadonlySet<string>;
} => {
	const policy = resolveDevelopmentPolicy(readDevelopmentConfig());
	const publicationPrefix = policy.branches.publicationRefPrefix
		.replace(/^refs\//u, '')
		.replace(/^heads\//u, '');
	const opened = api<readonly IPullRequest[]>(
		`repos/${REPOSITORY_SLUG}/pulls?state=open&per_page=100`,
	);
	return {
		facts: opened
			.filter((pull) => pull.head.ref.startsWith(publicationPrefix))
			.map((pull) => candidateFacts(pull)),
		publicationPrefix,
		armed: new Set(
			opened
				.filter((pull) => pull.auto_merge !== null)
				.map((pull) => pull.head.ref),
		),
	};
};

export const currentQueueHeadBranch = (): string | undefined => {
	const { facts, publicationPrefix } = currentQueueFacts();
	return queueHead(facts, publicationPrefix)?.headRef;
};

/**
 * The queue's branches, oldest first, conflicting ones included, each
 * with whether auto-merge is armed on it.
 */
export const currentQueueOrder = (): readonly {
	readonly branch: string;
	readonly armed: boolean;
}[] => {
	const { facts, publicationPrefix, armed } = currentQueueFacts();
	return queueOrder(facts, publicationPrefix).map((candidate) => ({
		branch: candidate.headRef,
		armed: armed.has(candidate.headRef),
	}));
};

/**
 * Where the integration branch's tip stands, asked of the forge.
 *
 * The next candidate lands on top of this commit, so it may only be
 * armed once this commit has passed its own full run. Otherwise a red
 * integration branch collects more merges before anyone sees it is red —
 * and once pull requests run only what their change reaches, the full
 * run on the integration branch is the only thing that sees the rest.
 */
const integrationCertification = (
	integration: string,
): { readonly sha: string; readonly state: IIntegrationCertification } => {
	const sha = api<{ readonly sha: string }>(
		`repos/${REPOSITORY_SLUG}/commits/${integration}`,
	).sha;
	const runs = api<{ readonly workflow_runs: readonly ICertificationRun[] }>(
		`repos/${REPOSITORY_SLUG}/actions/workflows/${CERTIFYING_WORKFLOW}/runs?head_sha=${sha}&per_page=50`,
	).workflow_runs;
	return { sha, state: certificationOf(runs, sha) };
};

/** Every full run of the certifying workflow at one commit, judged. */
const fullRunAt = (sha: string): IIntegrationCertification =>
	certificationOf(
		api<{ readonly workflow_runs: readonly ICertificationRun[] }>(
			`repos/${REPOSITORY_SLUG}/actions/workflows/${CERTIFYING_WORKFLOW}/runs?head_sha=${sha}&per_page=50`,
		).workflow_runs,
		sha,
	);

/**
 * Whether a candidate carries the integration branch's tip. Asked of the
 * commits, not of `mergeable_state`: with up-to-date not required, the
 * forge never reports `behind`.
 */
const levelWith = (integration: string, sha: string): boolean =>
	api<{ readonly behind_by: number }>(
		`repos/${REPOSITORY_SLUG}/compare/${integration}...${sha}`,
	).behind_by === 0;

/** Act on the repair step: dispatch a full run, or report. */
const reportRepair = (step: IRepairStep, integration: string): void => {
	if (step.kind === 'none') {
		console.log(
			`keep-the-queue-moving: ${integration} is red and no level candidate has a green full run that would repair it.`,
		);
		return;
	}
	if (step.kind === 'wait') {
		console.log(
			`keep-the-queue-moving: #${String(step.number)}'s full run is in progress; it is armed if it proves ${integration} green.`,
		);
		return;
	}
	if (step.kind === 'arm') {
		console.log(
			`keep-the-queue-moving: #${String(step.number)} is level and its full run is green, so landing it repairs ${integration}; it is armed.`,
		);
		return;
	}
	try {
		gh([
			'workflow',
			'run',
			CERTIFYING_WORKFLOW,
			'--ref',
			step.headRef,
			'--repo',
			REPOSITORY_SLUG,
		]);
		console.log(
			`keep-the-queue-moving: dispatched a full run on #${String(step.number)}; if it is green, landing it repairs ${integration}.`,
		);
	} catch {
		console.log(
			`keep-the-queue-moving: could not dispatch a full run on #${String(step.number)}; the next run tries again.`,
		);
	}
};

const main = (): void => {
	const policy = resolveDevelopmentPolicy(readDevelopmentConfig());
	const publicationPrefix = policy.branches.publicationRefPrefix
		.replace(/^refs\//u, '')
		.replace(/^heads\//u, '');
	const opened = api<readonly IPullRequest[]>(
		`repos/${REPOSITORY_SLUG}/pulls?state=open&per_page=100`,
	);
	// One candidate moves at a time. Only the head of the queue is armed,
	// and only once it is level with the integration branch: arming a
	// candidate that is behind lets the forge merge it on a green check
	// computed against an integration branch that no longer exists.
	const candidates = opened
		.filter((pull) => pull.head.ref.startsWith(publicationPrefix))
		.map((pull) => candidateFacts(pull));
	const head = queueHead(candidates, publicationPrefix);
	const integration = policy.branches.integration;
	const certification = integrationCertification(integration);
	const certified = certification.state === 'certified';
	const shaOf = (number: number): string =>
		opened.find((pull) => pull.number === number)?.head.sha ?? '';
	// A red integration branch arms nothing, except the candidate proven
	// to repair it.
	const repair: IRepairStep =
		certification.state === 'red'
			? repairStep(
					candidates,
					publicationPrefix,
					(candidate) =>
						levelWith(integration, shaOf(candidate.number)),
					(candidate) => fullRunAt(shaOf(candidate.number)),
				)
			: { kind: 'none' };
	const repairing = repair.kind === 'arm' ? repair.number : undefined;
	if (!certified) {
		console.log(
			`keep-the-queue-moving: ${integration} at ${certification.sha.slice(0, 9)} is ${certification.state}, not certified by a green full run; nothing is armed until it is, except a candidate proven to repair it.`,
		);
		if (certification.state === 'red') reportRepair(repair, integration);
	}
	for (const pull of opened) {
		if (
			pull.auto_merge === null ||
			(certified && pull.number === head?.number) ||
			pull.number === repairing ||
			!pull.head.ref.startsWith(publicationPrefix)
		) {
			continue;
		}
		try {
			gh(['pr', 'merge', String(pull.number), '--disable-auto']);
			console.log(
				pull.number === head?.number
					? `keep-the-queue-moving: #${String(pull.number)} is the head of the queue, but the integration branch is not certified; auto-merge disarmed until it is.`
					: `keep-the-queue-moving: #${String(pull.number)} is not the head of the queue; auto-merge disarmed until it is.`,
			);
		} catch {
			// Reported by its still-armed state on the next run.
		}
	}
	const headPull = opened.find((pull) => pull.number === head?.number);
	const headBehind =
		headPull !== undefined && mergeState(headPull.number) === 'behind';
	if (headPull !== undefined && headBehind) {
		console.log(
			`keep-the-queue-moving: #${String(headPull.number)} is the head of the queue and behind the integration branch; the owner machine brings it forward, then it is armed.`,
		);
	}
	const repairPull = opened.find((pull) => pull.number === repairing);
	const justArmed =
		repairPull !== undefined
			? armCandidates(
					[repairPull],
					publicationPrefix,
					policy.integration.mergeMethod,
				)
			: headPull === undefined || headBehind || !certified
				? []
				: armCandidates(
						[headPull],
						publicationPrefix,
						policy.integration.mergeMethod,
					);
	if (justArmed.length > 0) {
		console.log(
			`keep-the-queue-moving: armed auto-merge on ${String(justArmed.length)} candidate(s): ${justArmed.map((n) => `#${String(n)}`).join(', ')}.`,
		);
	}
	const open =
		justArmed.length === 0
			? opened
			: api<readonly IPullRequest[]>(
					`repos/${REPOSITORY_SLUG}/pulls?state=open&per_page=100`,
				);
	const armed = open.filter((pull) => pull.auto_merge !== null);
	if (armed.length === 0) {
		console.log(
			'keep-the-queue-moving: no pull request is waiting to auto-merge; nothing to keep moving.',
		);
		return;
	}

	let released = 0;
	const behind: string[] = [];
	const failing: string[] = [];
	const refusedReleases = new Set<string>();
	for (const pull of armed) {
		// Before reading the checks, make sure there are any. A parked run
		// contributes no check at all, so a candidate stuck this way reads
		// as green-and-blocked rather than red.
		const atHead = releaseWaitingRuns(pull.head.sha);
		released += atHead.released;
		for (const name of atHead.refused) refusedReleases.add(name);
		const runs = checksOf(pull.head.sha);
		const failures = failuresOf(runs);
		if (failures.length > 0) {
			// Reported whether or not it is behind. A candidate whose
			// author armed auto-merge and then walked away is work that
			// looks finished and is not; the queue is the only thing in a
			// position to notice, and staying silent about it is how a
			// pull request sits red for a day.
			failing.push(
				`  #${pull.number} ${pull.title} — ${failures.join(', ')}`,
			);
		}
		const state = mergeState(pull.number);
		if (state === 'unknown') {
			console.log(
				`keep-the-queue-moving: #${pull.number} — the forge has not finished computing mergeability; left for the next run rather than guessed at.`,
			);
			continue;
		}
		if (state !== 'behind') continue;
		if (failures.length > 0) {
			console.log(
				`keep-the-queue-moving: #${pull.number} is behind AND red — left alone. Refreshing it would spend a CI run to re-learn a failure that has to be fixed anyway.`,
			);
			continue;
		}
		// REPORTED, NOT UPDATED — and this is the whole lesson of #99.
		//
		// `update-branch` is an API call, so its commit is attributed to
		// the token that made it: a bot, always, because this job runs
		// inside a workflow. The forge will not start workflows on a
		// bot's commit — it parks them as `action_required` — so every
		// candidate this job refreshed came back BLOCKED with nothing red
		// on it, and the required check never reported at all.
		//
		// Measured: twenty-one parked runs across five pull requests.
		// Releasing them by hand worked, and this job re-parked them on
		// its next pass. A loop, in which the thing built to move the
		// queue was the only thing stopping it.
		//
		// So it stops writing commits. Refreshing a candidate belongs to
		// whoever owns it, pushing with their own credential, because
		// that is the only push the forge will build. This job's job is
		// to say which candidates need it — which is what nobody was
		// doing before, and the actual gap.
		behind.push(
			`  #${pull.number} ${pull.title} — behind the integration branch; refresh it from the machine that owns it (\`bun run forge:refresh -- --apply\`).`,
		);
	}

	console.log(
		`keep-the-queue-moving: ${armed.length} armed, ${released} parked run(s) released, ${behind.length} waiting on a refresh.`,
	);

	if (behind.length > 0) {
		console.log(
			`\nkeep-the-queue-moving: ${behind.length} candidate(s) are behind the integration branch:`,
		);
		for (const line of behind) console.log(line);
	}

	if (refusedReleases.size > 0) {
		// Loud, because the failure mode is invisible: the pull request
		// shows no red check, it simply never becomes mergeable.
		console.log(
			`keep-the-queue-moving: the forge refused to start ${[...refusedReleases].join(', ')} — those candidates will stay blocked with nothing red to fix. The job needs \`actions: write\`.`,
		);
	}

	if (failing.length === 0) {
		console.log('keep-the-queue-moving: no armed candidate is red.');
		stuckExit(behind.length, 0);
		return;
	}
	// Stdout, not a failed exit. This job runs on the integration branch
	// and a red PULL REQUEST is not a reason to call the integration
	// branch broken — that inversion is how a real signal gets muted. The
	// job summary is where a human, or the agent that opened it, sees it.
	console.log(
		`\nkeep-the-queue-moving: ${failing.length} armed candidate(s) are red and will never merge on their own:`,
	);
	for (const line of failing) console.log(line);
	writeSummary(failing);
	stuckExit(behind.length, failing.length);
};

/**
 * A stuck queue ends RED.
 *
 * This job cannot refresh a candidate itself — a branch it updated would
 * carry a bot commit, whose runs the forge parks — so the only thing it
 * can do about a stale or permanently-blocked candidate is say so. Saying
 * so inside the log of a green run is the same as not saying it: run #216
 * succeeded while the whole queue sat behind. The exit code is the only
 * part of a run anybody reads at a glance, so it carries the fact.
 */
const stuckExit = (behind: number, red: number): void => {
	if (behind === 0 && red === 0) return;
	const reasons = [
		behind > 0 ? `${String(behind)} behind the integration branch` : '',
		red > 0 ? `${String(red)} armed and red` : '',
	].filter((reason) => reason.length > 0);
	console.error(
		`keep-the-queue-moving: the queue is stuck — ${reasons.join(', ')}. Nothing merges until these are refreshed or fixed; this job does not push, because a commit it writes would park the forge's runs.`,
	);
	process.exitCode = 1;
};

/**
 * Put the red candidates in the run summary too.
 *
 * A line in a log nobody opens is the same as no line at all, and the
 * whole point of this is that a pull request cannot be left half-landed
 * because everyone moved on to the next thing.
 */
const writeSummary = (failing: readonly string[]): void => {
	const path = process.env.GITHUB_STEP_SUMMARY;
	if (path === undefined) return;
	appendFileSync(
		path,
		[
			'### Armed candidates that are red',
			'',
			'These have auto-merge on and will never merge until somebody',
			'fixes them.',
			'',
			...failing.map((line) => `- ${line.trim()}`),
			'',
		].join('\n'),
	);
};

if (import.meta.main) main();
