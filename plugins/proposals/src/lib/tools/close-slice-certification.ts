/**
 * close-slice-certification.ts — the certification that already exists for
 * a slice's tree, read before any gate is run.
 *
 * WHO CERTIFIES follows the project's configured landing route, not this
 * tool: under a pull-request route the forge's required checks certify the
 * pushed work; under a merge route the local gate `work publish` ran when
 * it landed the unit does. Running the whole gate again here would buy a
 * second answer to a question that already has one, and on a loaded
 * machine it never finishes inside the claim.
 *
 * WHICH TREE IS COMPARED: the slice's tree is the git tree hash of the
 * checkout `close_slice` runs in (HEAD plus tracked edits and new files,
 * the host's own state excluded; see `close-slice-gate-tree.ts`). It is
 * compared with `<commit>^{tree}` of a commit the forge holds a result
 * for. Equal trees are the same content whatever the commits' parents or
 * messages; any difference — one edited file, a merge of a newer develop
 * that CI never saw — is NO evidence, never "close enough".
 *
 * Nothing here runs a gate or passes silently: no required check named,
 * no `gh`, no commit with this tree, a check still running or missing all
 * answer `none` with what is missing and how to get it.
 */
// effect-boundary-authorized: the forge's CLI and git plumbing are read-only questions about the pushed work; ctx.effects offers neither.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

import {
	CLOSE_GATE_FAILING_CONCLUSIONS,
	CLOSE_GATE_PASSING_CONCLUSIONS,
	CLOSE_GATE_PULL_REQUEST_SEARCH_LIMIT,
	LANDING_CERTIFICATION_DIRECTORY,
} from '../contracts/constants/close-slice-gate.constant';
import { readTextOrNull } from '../proposals/index-reader';
import type {
	ICloseGateCertification,
	ICertificationPorts,
	ICloseGateCertificationReader,
} from '../contracts/interfaces/close-slice-gate.interface';

const SYSTEM_COMMAND_TIMEOUT_MS = 30_000;
const SYSTEM_BUFFER_BYTES = 8 * 1024 * 1024;
const SHORT_SHA = 12;

const run =
	(binary: string, cwd: string) =>
	(args: readonly string[]): string | undefined => {
		try {
			return execFileSync(binary, [...args], {
				cwd,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
				timeout: SYSTEM_COMMAND_TIMEOUT_MS,
				maxBuffer: SYSTEM_BUFFER_BYTES,
			}).trim();
		} catch {
			return undefined;
		}
	};

/** The real git, gh and disk, for a checkout. */
export const systemCertificationPorts = (cwd: string): ICertificationPorts => ({
	git: run('git', cwd),
	gh: run('gh', cwd),
	readFile: async (path) => (await readTextOrNull(path)) ?? undefined,
});

type ILandingRoute = 'pull-request' | 'merge' | 'direct';

const routeOf = (policy: IResolvedDevelopmentPolicy): ILandingRoute => {
	if (policy.integration.requiresPullRequest) return 'pull-request';
	return policy.integration.strategy === 'merge' ? 'merge' : 'direct';
};

const none = (
	missing: readonly string[],
	nextAction: string,
): ICloseGateCertification => ({ state: 'none', missing, nextAction });

const short = (sha: string): string => sha.slice(0, SHORT_SHA);

// ── merge route: the certification `work publish` recorded when it landed ──

const readLandingCertification = async (
	ports: ICertificationPorts,
	tree: string,
): Promise<ICloseGateCertification> => {
	const gitDir = ports.git([
		'rev-parse',
		'--path-format=absolute',
		'--git-common-dir',
	]);
	const record =
		gitDir === undefined || gitDir === ''
			? undefined
			: await ports.readFile(
					join(
						gitDir,
						LANDING_CERTIFICATION_DIRECTORY,
						`${tree}.json`,
					),
				);
	if (record !== undefined) {
		try {
			const parsed = JSON.parse(record) as {
				readonly tree?: unknown;
				readonly coveredTree?: unknown;
				readonly candidateSha?: unknown;
				readonly integrationSha?: unknown;
			};
			if (parsed.tree === tree || parsed.coveredTree === tree) {
				return {
					state: 'certified',
					source: 'landing-certification',
					evidence: `the local gate certified the merge ${String(parsed.candidateSha ?? '?').slice(0, SHORT_SHA)} on ${String(parsed.integrationSha ?? '?').slice(0, SHORT_SHA)} when this unit landed`,
				};
			}
		} catch {
			// An unreadable record certifies nothing.
		}
	}
	return none(
		[
			`no local certification is recorded for tree ${short(tree)}: the unit has not landed by \`work publish\`, or its tree changed since`,
		],
		'Land the unit with `delendai work publish`: it certifies the merge with the project gate and records the result, then call close_slice again. Otherwise close_slice runs the gate locally.',
	);
};

// ── pull-request route: the forge's required checks on a commit with this tree ──

interface ICheckRun {
	readonly name: string;
	readonly status: string;
	readonly conclusion: string;
	readonly url: string;
}

const parseCheckRuns = (text: string): readonly ICheckRun[] =>
	text
		.split('\n')
		.filter((line) => line.trim() !== '')
		.map((line) => {
			const [name = '', status = '', conclusion = '', url = ''] =
				line.split('\t');
			return { name, status, conclusion, url };
		});

const treeOf = (ports: ICertificationPorts, sha: string): string | undefined =>
	ports.git(['rev-parse', '-q', '--verify', `${sha}^{tree}`]);

/** Commits the forge may hold results for: this checkout's HEAD and recent pull-request heads. */
const candidateCommits = (ports: ICertificationPorts): readonly string[] => {
	const head = ports.git(['rev-parse', '-q', '--verify', 'HEAD']);
	const heads =
		ports.gh([
			'pr',
			'list',
			'--state',
			'all',
			'--limit',
			String(CLOSE_GATE_PULL_REQUEST_SEARCH_LIMIT),
			'--json',
			'headRefOid',
			'--jq',
			'.[].headRefOid',
		]) ?? '';
	return [
		...new Set(
			[head ?? '', ...heads.split('\n')].filter(
				(sha) => sha.trim() !== '',
			),
		),
	];
};

const readCheckRuns = (
	ports: ICertificationPorts,
	sha: string,
): readonly ICheckRun[] | undefined => {
	const text = ports.gh([
		'api',
		`repos/{owner}/{repo}/commits/${sha}/check-runs`,
		'--paginate',
		'--jq',
		'.check_runs[] | [.name, .status, (.conclusion // ""), (.html_url // "")] | @tsv',
	]);
	return text === undefined ? undefined : parseCheckRuns(text);
};

const publishNextAction = (checks: readonly string[]): string =>
	`Publish the unit (\`delendai work publish\`); CI certifies the pushed tree through ${checks.join(', ')}. Once it is green call close_slice again — it then closes from that result without running the gate here. Without CI evidence close_slice runs the gate locally.`;

const judgeCommit = (
	required: readonly string[],
	runs: readonly ICheckRun[],
	sha: string,
): ICloseGateCertification => {
	const passing: readonly string[] = CLOSE_GATE_PASSING_CONCLUSIONS;
	const failing: readonly string[] = CLOSE_GATE_FAILING_CONCLUSIONS;
	const waiting: string[] = [];
	for (const check of required) {
		const ofCheck = runs.filter((run) => run.name === check);
		const red = ofCheck.find(
			(run) =>
				run.status === 'completed' && failing.includes(run.conclusion),
		);
		if (red !== undefined) {
			return {
				state: 'failed',
				check,
				evidence: `required check \`${check}\` ${red.conclusion} on ${short(sha)}${red.url === '' ? '' : ` (${red.url})`}`,
				nextAction: `Fix what \`${check}\` reports (its log is at ${red.url === '' ? 'the pull request' : red.url}), commit in the unit and \`delendai work publish\` again; a new tree is certified afresh.`,
			};
		}
		const green = ofCheck.some(
			(run) =>
				run.status === 'completed' && passing.includes(run.conclusion),
		);
		if (!green) {
			waiting.push(
				ofCheck.length === 0
					? `required check \`${check}\` has not reported on ${short(sha)}`
					: `required check \`${check}\` is still ${ofCheck[0]?.status ?? 'running'} on ${short(sha)}`,
			);
		}
	}
	return waiting.length === 0
		? {
				state: 'certified',
				source: 'forge-check',
				evidence: `required check${required.length === 1 ? '' : 's'} ${required.map((check) => `\`${check}\``).join(', ')} passed on ${short(sha)}, whose tree equals this slice's`,
			}
		: none(
				waiting,
				'CI has not finished certifying this tree: wait for the check, then call close_slice again. Without CI evidence close_slice runs the gate locally.',
			);
};

const readForgeCertification = (
	ports: ICertificationPorts,
	policy: IResolvedDevelopmentPolicy,
	tree: string,
): ICloseGateCertification => {
	const required = policy.integration.requiredChecks;
	if (required.length === 0) {
		return none(
			[
				'the policy names no required check (integration.requiredChecks), so a forge result cannot be read as certification',
			],
			'Declare integration.requiredChecks in delendai.config.json so the forge result can certify; until then close_slice runs the gate locally.',
		);
	}
	if (ports.gh(['--version']) === undefined) {
		return none(
			[
				'the `gh` CLI is not available here, so the forge could not be asked',
			],
			publishNextAction(required),
		);
	}
	const matching = candidateCommits(ports).filter(
		(sha) => treeOf(ports, sha) === tree,
	);
	if (matching.length === 0) {
		return none(
			[
				`no pushed commit has tree ${short(tree)}: the unit is not published, or it changed since (a mismatched tree is no evidence)`,
			],
			publishNextAction(required),
		);
	}
	const outcomes = matching.map((sha) => {
		const runs = readCheckRuns(ports, sha);
		return runs === undefined
			? none(
					[`the forge returned no check results for ${short(sha)}`],
					publishNextAction(required),
				)
			: judgeCommit(required, runs, sha);
	});
	return (
		outcomes.find((outcome) => outcome.state === 'certified') ??
		outcomes.find((outcome) => outcome.state === 'failed') ??
		outcomes[0] ??
		none(['no check results'], publishNextAction(required))
	);
};

/**
 * The reader `close_slice` consults: which landing route the project
 * configures decides who is asked.
 */
export const createCertificationReader =
	(input: {
		readonly policy: IResolvedDevelopmentPolicy | undefined;
		readonly ports: ICertificationPorts;
	}): ICloseGateCertificationReader =>
	async (tree) => {
		const { policy, ports } = input;
		if (policy === undefined) {
			return none(
				[
					'the project declares no development policy, so no one else certifies',
				],
				'close_slice runs the project gate locally.',
			);
		}
		switch (routeOf(policy)) {
			case 'pull-request':
				return readForgeCertification(ports, policy, tree);
			case 'merge':
				return await readLandingCertification(ports, tree);
			default:
				return none(
					[
						'this profile integrates directly: the local gate is the certification',
					],
					'close_slice runs the project gate locally.',
				);
		}
	};
