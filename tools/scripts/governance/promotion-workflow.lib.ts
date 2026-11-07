/**
 * promotion-workflow.lib.ts — the workflow that opens a promotion on the
 * cadence the project declares, projected from its configuration like
 * the other forge settings.
 *
 * Promotions were opened by hand, whenever somebody noticed the
 * integration branch was stable. A project that declares a cadence gets
 * a workflow that asks, each time it comes round, whether the promotion
 * is ready, and opens the release pull request when it is. The workflow
 * only opens: it never merges, bumps or tags, and the release branch's
 * own gate still judges the pull request it opened.
 *
 * A project with one branch, or that declares no cadence, gets no
 * workflow at all — and no diagnostic for not having one.
 */
import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

/** The cadence that means "whenever the integration branch moves". */
/** The commit `actions/checkout@v7` points at; the tag is restored as a comment on render. */
export const CHECKOUT_ACTION_SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';
export const CHECKOUT_ACTION_TAG = 'v7';

export const PROMOTION_ON_READY = 'on-ready';
/** Where the workflow is written, relative to the repository. */
export const PROMOTION_WORKFLOW_PATH = '.github/workflows/open-promotion.yml';
/** The command the workflow runs; the script decides, the workflow only asks. */
export const PROMOTION_COMMAND =
	'bun tools/scripts/forge/open-promotion.script.ts --apply';

/**
 * How often `on-ready` asks. A push cannot be the trigger: at the moment
 * the integration branch moves, the checks its new head needs have not
 * run, so every push-triggered run was held back by them; and a merge the
 * queue makes with the workflow token starts no push run at all. Asking
 * every hour opens the promotion within the hour of the branch being
 * ready, whoever merged into it.
 */
export const PROMOTION_ON_READY_CRON = '37 * * * *';

/** What triggers the workflow, from the declared cadence. */
const triggerOf = (schedule: string): Readonly<Record<string, unknown>> => ({
	schedule: [
		{
			cron:
				schedule === PROMOTION_ON_READY
					? PROMOTION_ON_READY_CRON
					: schedule,
		},
	],
	workflow_dispatch: {},
});

/**
 * The workflow document, or nothing when the project has nowhere to
 * promote to or no cadence to promote on.
 */
export const promotionWorkflowDocument = (
	policy: IResolvedDevelopmentPolicy,
	schedule: string | undefined,
): Readonly<Record<string, unknown>> | undefined => {
	const { integration, release } = policy.branches;
	if (schedule === undefined || schedule.trim() === '') return undefined;
	if (release === integration) return undefined;
	return {
		name: 'open-promotion',
		on: triggerOf(schedule.trim()),
		// One promotion is considered at a time; a second trigger waits.
		concurrency: { group: 'open-promotion', 'cancel-in-progress': false },
		// It reads the checks and the alerts and opens a pull request.
		// It holds no permission to push: it cannot merge, bump or tag.
		permissions: {
			contents: 'read',
			actions: 'read',
			checks: 'read',
			'security-events': 'read',
			'pull-requests': 'write',
		},
		jobs: {
			'open-promotion': {
				name: `open the promotion of ${integration} into ${release} when it is ready`,
				'runs-on': 'ubuntu-latest',
				'timeout-minutes': 10,
				steps: [
					{
						name: 'Checkout (required to resolve the local composite action)',
						uses: `actions/checkout@${CHECKOUT_ACTION_SHA}`,
					},
					{
						name: 'Setup repo (checkout + bun + install)',
						uses: './.github/actions/setup-bun-repo',
					},
					// A scheduled run starts on the default branch, which
					// may be the release branch: the roadmap and the tooling
					// that judge the promotion are the integration
					// branch's, so the run stands there before it asks.
					// The release branch's tip is fetched too: whether the
					// integration branch carries a release is read against
					// its version.
					{
						name: 'Stand on the integration branch',
						run: 'git fetch --depth=1 origin "$RELEASE:refs/remotes/origin/$RELEASE" && git fetch --depth=1 origin "$INTEGRATION" && git checkout -q --detach FETCH_HEAD && bun install --frozen-lockfile',
						env: { INTEGRATION: integration, RELEASE: release },
					},
					{
						name: 'Open the promotion if it is ready, or say what holds it back',
						run: PROMOTION_COMMAND,
						env: { GH_TOKEN: '${{ github.token }}' },
					},
				],
			},
		},
	};
};
