#!/usr/bin/env bun
/**
 * open-promotion — open the release pull request when the promotion is
 * ready, or say which condition holds it back.
 *
 * Ready means four things, each read where it lives: the checks the
 * integration branch requires are green on its head; code scanning
 * reports no open alert on it; the roadmap's blocking gates for the
 * next version pass; and the integration branch carries the release —
 * a version above the release branch's and its changelog section —
 * because every promotion is a release and the release branch's gate
 * refuses one that is not. When it is, the pull request from the integration
 * branch into the release branch is opened with that evidence in its
 * body. It is only opened: this never merges, bumps or tags, and the
 * release branch's own gate still judges it.
 *
 * Branch names, the cadence and the blocking gates come from the
 * project's configuration. A project with one branch, or that declares
 * no cadence, has nothing to do here and is told nothing.
 *
 *   bun tools/scripts/forge/open-promotion.script.ts [--apply]
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseJsonc } from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import {
	gatherGateEvidence,
	horizonReadiness,
	type IPromotionEvidence,
	type IPromotionReadiness,
	isPublished,
	openRoadmapWorkspace,
	promotionReadiness,
} from '@delendai/roadmap/public';

import { declaredRoadmap } from '../gen/roadmap-projection.lib';
import { repoRoot } from '../lib/repo-root';
import { RELEASE_FIX, releaseGaps } from '../release/release-pr-check.script';

/** The forge's command line: its answer, or why it gave none. */
export type IForge = (
	args: readonly string[],
) =>
	| { readonly ok: true; readonly out: string }
	| { readonly ok: false; readonly error: string };

export interface IPromotionPlan {
	readonly integration: string;
	readonly release: string;
	readonly schedule: string;
	readonly requiredChecks: readonly string[];
}

export type IPromotionOutcome =
	| 'nothing-declared'
	| 'held-back'
	| 'already-open'
	| 'would-open'
	| 'opened'
	| 'could-not-open';

/** What the forge says when a project has no code scanning at all. */
const NO_CODE_SCANNING = /no analysis found|not enabled|\b404\b|Not Found/iu;

/** The promotion a configuration declares, or nothing. */
export const promotionPlanOf = (
	configText: string | undefined,
): IPromotionPlan | undefined => {
	const schedule = declaredRoadmap(configText)?.promotion?.schedule;
	if (configText === undefined || schedule === undefined) return undefined;
	const { value, errors } = parseJsonc(configText);
	// A config that does not parse declares no promotion.
	if (errors.length > 0) return undefined;
	const config = value as {
		development?: Record<string, unknown>;
	};
	const policy = resolveDevelopmentPolicy(
		config.development === undefined
			? {}
			: { development: config.development },
	);
	const { integration, release } = policy.branches;
	if (release === integration) return undefined;
	return {
		integration,
		release,
		schedule,
		requiredChecks: policy.integration.requiredChecks,
	};
};

/**
 * The conclusion each required check last reported on the branch's head.
 *
 * A code scanning tool's required check (GitHub's `CodeQL`) is posted on
 * pull requests only: a push to the branch uploads an analysis and posts
 * no check of that name, so read from check runs alone it never reports
 * and the promotion would wait forever. An analysis by a tool of that name
 * on the head commit is that check's report; what it found is judged by
 * the open alert count, a condition of its own.
 */
export const checkConclusions = (
	plan: IPromotionPlan,
	forge: IForge,
): IPromotionEvidence['checks'] => {
	const answer = forge([
		'api',
		`repos/{owner}/{repo}/commits/${plan.integration}/check-runs?per_page=100`,
		'--jq',
		'[.check_runs[] | {name, conclusion, completed_at, head_sha}]',
	]);
	let runs: readonly {
		readonly name: string;
		readonly conclusion: string | null;
		readonly completed_at: string | null;
		readonly head_sha?: string;
	}[] = [];
	if (answer.ok) {
		try {
			runs = JSON.parse(answer.out) as typeof runs;
		} catch {
			runs = [];
		}
	}
	const reported = plan.requiredChecks.map((name) => {
		const latest = runs
			.filter((run) => run.name === name && run.completed_at !== null)
			.sort((a, b) =>
				String(b.completed_at).localeCompare(String(a.completed_at)),
			)[0];
		return { name, conclusion: latest?.conclusion ?? undefined };
	});
	const head = runs.find((run) => run.head_sha !== undefined)?.head_sha;
	if (
		head === undefined ||
		reported.every((check) => check.conclusion !== undefined)
	)
		return reported;
	const analyses = forge([
		'api',
		`repos/{owner}/{repo}/code-scanning/analyses?ref=refs/heads/${plan.integration}&per_page=20`,
		'--jq',
		`[.[] | select(.commit_sha == "${head}") | .tool.name]`,
	]);
	let tools: readonly string[] = [];
	if (analyses.ok) {
		try {
			tools = JSON.parse(analyses.out) as readonly string[];
		} catch {
			tools = [];
		}
	}
	return reported.map((check) =>
		check.conclusion === undefined && tools.includes(check.name)
			? { name: check.name, conclusion: 'success' }
			: check,
	);
};

/** Open code scanning alerts on the branch: a count, none to report, or unknown. */
export const openAlertCount = (
	plan: IPromotionPlan,
	forge: IForge,
): IPromotionEvidence['openAlerts'] => {
	const answer = forge([
		'api',
		'--paginate',
		`repos/{owner}/{repo}/code-scanning/alerts?ref=refs/heads/${plan.integration}&state=open&per_page=100`,
		'--jq',
		'length',
	]);
	if (!answer.ok)
		return NO_CODE_SCANNING.test(answer.error) ? null : undefined;
	const total = answer.out
		.split('\n')
		.map((line) => Number(line.trim()))
		.filter((count) => Number.isInteger(count))
		.reduce((sum, count) => sum + count, 0);
	return total;
};

/** The roadmap's verdict on the first version not yet published. */
export const roadmapVerdict = async (
	root: string,
	configText: string,
): Promise<IPromotionEvidence['roadmap']> => {
	const options = declaredRoadmap(configText);
	if (options === undefined) return undefined;
	// Where the proposals a gate names live: the project's docs directory.
	const { value, errors } = parseJsonc(configText);
	if (errors.length > 0) {
		return {
			version: '?',
			status: 'unknown',
			reason: 'delendai.config.json does not parse',
		};
	}
	const docsDir = (value as { docsDir?: unknown }).docsDir;
	const workspace = await openRoadmapWorkspace({
		workspaceRoot: root,
		docsDir: join(root, typeof docsDir === 'string' ? docsDir : 'docs'),
		options,
	});
	if (!workspace.ok) {
		return { version: '?', status: 'unknown', reason: workspace.reason };
	}
	const roadmap = await workspace.value.roadmap.read();
	if (!roadmap.ok) {
		return { version: '?', status: 'unknown', reason: roadmap.reason };
	}
	const current = await workspace.value.currentVersion();
	const horizon = roadmap.value.horizons.find(
		(each) => isPublished(each.version, current) !== true,
	);
	if (horizon === undefined) return undefined;
	const readiness = horizonReadiness(
		horizon,
		await gatherGateEvidence(roadmap.value, workspace.value),
		workspace.value.policy,
	);
	return {
		version: readiness.version,
		status: readiness.status,
		reason: readiness.reason,
	};
};

/** The pull request's title and body: what is promoted, and on what evidence. */
export const promotionPullRequest = (
	plan: IPromotionPlan,
	readiness: IPromotionReadiness,
): { readonly title: string; readonly body: string } => ({
	title: `release: promote ${plan.integration} into ${plan.release}${readiness.version === undefined ? '' : ` (${readiness.version})`}`,
	body: [
		`Opened on the cadence the project declares (\`${plan.schedule}\`), because the promotion is ready:`,
		'',
		...readiness.evidence.map((line) => `- ${line}`),
		'',
		`This pull request was only opened. Nothing was merged, bumped or tagged; the gate of \`${plan.release}\` decides.`,
	].join('\n'),
});

export const openPromotion = async (input: {
	readonly root: string;
	readonly configText: string | undefined;
	readonly forge: IForge;
	readonly apply: boolean;
	/** What the integration branch lacks to be a release; omitted, nothing is asked. */
	readonly releaseGaps?: (plan: IPromotionPlan) => readonly string[];
}): Promise<{
	readonly outcome: IPromotionOutcome;
	readonly lines: readonly string[];
}> => {
	const plan = promotionPlanOf(input.configText);
	if (plan === undefined || input.configText === undefined) {
		return { outcome: 'nothing-declared', lines: [] };
	}
	const readiness = promotionReadiness({
		checks: checkConclusions(plan, input.forge),
		openAlerts: openAlertCount(plan, input.forge),
		roadmap: await roadmapVerdict(input.root, input.configText),
	});
	const route = `${plan.integration} into ${plan.release}`;
	const notReleased = (input.releaseGaps?.(plan) ?? []).map(
		(gap) => `${gap} — ${RELEASE_FIX}`,
	);
	if (!readiness.ready || notReleased.length > 0) {
		return {
			outcome: 'held-back',
			lines: [
				`open-promotion: ${route} is not ready, so nothing was opened:`,
				...[...readiness.heldBackBy, ...notReleased].map(
					(line) => `  - ${line}`,
				),
			],
		};
	}
	const existing = input.forge([
		'pr',
		'list',
		'--base',
		plan.release,
		'--head',
		plan.integration,
		'--state',
		'open',
		'--json',
		'number',
		'--jq',
		'.[0].number // empty',
	]);
	if (existing.ok && existing.out.trim() !== '') {
		return {
			outcome: 'already-open',
			lines: [
				`open-promotion: ${route} is ready and pull request #${existing.out.trim()} is already open for it.`,
			],
		};
	}
	const pullRequest = promotionPullRequest(plan, readiness);
	if (!input.apply) {
		return {
			outcome: 'would-open',
			lines: [
				`open-promotion: ${route} is ready; --apply would open "${pullRequest.title}".`,
				...readiness.evidence.map((line) => `  - ${line}`),
			],
		};
	}
	const opened = input.forge([
		'pr',
		'create',
		'--base',
		plan.release,
		'--head',
		plan.integration,
		'--title',
		pullRequest.title,
		'--body',
		pullRequest.body,
	]);
	return opened.ok
		? {
				outcome: 'opened',
				lines: [
					`open-promotion: opened ${opened.out.trim()} — ${route}.`,
				],
			}
		: {
				outcome: 'could-not-open',
				lines: [
					`open-promotion: ${route} is ready, and the pull request could not be opened: ${opened.error}`,
				],
			};
};

const gh: IForge = (args) => {
	try {
		return {
			ok: true,
			out: execFileSync('gh', [...args], {
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
				maxBuffer: 16 * 1024 * 1024,
			}),
		};
	} catch (error) {
		const stderr = (error as { stderr?: unknown }).stderr;
		return {
			ok: false,
			error:
				typeof stderr === 'string' && stderr.trim() !== ''
					? (stderr.trim().split('\n')[0] ?? '')
					: error instanceof Error
						? (error.message.split('\n')[0] ?? '')
						: String(error),
		};
	}
};

const main = async (): Promise<number> => {
	const root = repoRoot();
	let configText: string | undefined;
	try {
		configText = await readFile(join(root, 'delendai.config.json'), 'utf8');
	} catch {
		configText = undefined;
	}
	const result = await openPromotion({
		root,
		configText,
		forge: gh,
		apply: process.argv.includes('--apply'),
		releaseGaps: (plan) => releaseGaps(root, `origin/${plan.release}`),
	});
	for (const line of result.lines) console.log(line);
	// Held back is an answer, not a failure of the run; only a pull request
	// that should have been opened and was not fails it.
	return result.outcome === 'could-not-open' ? 1 : 0;
};

if (import.meta.main) process.exit(await main());
