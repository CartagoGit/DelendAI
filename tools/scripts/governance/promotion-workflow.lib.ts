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
export const PROMOTION_ON_READY = 'on-ready';
/** Where the workflow is written, relative to the repository. */
export const PROMOTION_WORKFLOW_PATH = '.github/workflows/open-promotion.yml';
/** The command the workflow runs; the script decides, the workflow only asks. */
export const PROMOTION_COMMAND =
	'bun tools/scripts/forge/open-promotion.script.ts --apply';

/** What triggers the workflow, from the declared cadence. */
const triggerOf = (
	schedule: string,
	integration: string,
): Readonly<Record<string, unknown>> =>
	schedule === PROMOTION_ON_READY
		? { push: { branches: [integration] }, workflow_dispatch: {} }
		: { schedule: [{ cron: schedule }], workflow_dispatch: {} };

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
		on: triggerOf(schedule.trim(), integration),
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
						uses: 'actions/checkout@v7',
					},
					{
						name: 'Setup repo (checkout + bun + install)',
						uses: './.github/actions/setup-bun-repo',
					},
					// A scheduled run starts on the default branch, which
					// is the release branch: the roadmap and the tooling
					// that judge the promotion are the integration
					// branch's, so the run stands there before it asks.
					{
						name: 'Stand on the integration branch',
						run: 'git fetch --depth=1 origin "$INTEGRATION" && git checkout -q --detach FETCH_HEAD && bun install --frozen-lockfile',
						env: { INTEGRATION: integration },
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
