/**
 * f00140 S2 — `router` CLI command.
 *
 * Surfaces `auto-agent-selector`'s recommendations + `usage-tracking`'s
 * spend through the shared dashboard view-model (`buildDashboard` from
 * `@delendai/auto-agent-selector/public`) so the user can see and pin
 * routing decisions straight from the terminal.
 *
 * The router command never makes a routing decision of its own: it pulls
 * `auto_status` for the reachable roster, one `auto_recommend` per known
 * task type for the recommendation rows, and `usage_report` (grouped by
 * `provider`) for the spend picture — then projects them through the
 * pure builder S1 shipped. Pinning writes through the existing
 * `auto_recommend` shape so future S5 wiring (the proposal reserves it)
 * can read the same pin.
 *
 * Read-only by default. `--pin` writes; everything else is advisory.
 */
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import type { IProviderCandidate } from '@delendai/auto-agent-selector/public';
import type {
	IRecommendationRow,
	IProviderSpend,
} from '@delendai/auto-agent-selector/public';
import { buildDashboard } from '@delendai/auto-agent-selector/public';
import { formatRows } from '../../lib/text-format.service';
import { data, hasFlag, request, scalarArg } from './group-helpers';

const STATUS = 'mcp-vertex_auto-agent-selector_auto_status';
const RECOMMEND = 'mcp-vertex_auto-agent-selector_auto_recommend';
const USAGE = 'mcp-vertex_usage-tracking_usage_report';

/**
 * A short, opinionated default set of task types the dashboard surfaces
 * when the host does not specify `--task`. Stays small + first-class so the
 * table stays readable; users add their own with repeated `--task` flags.
 */
const DEFAULT_TASK_TYPES: readonly string[] = [
	'code-edit',
	'long-context',
	'reasoning',
	'summarization',
];

const parseTaskTypes = (raw: string | undefined): readonly string[] => {
	if (raw === undefined || raw.trim() === '') return DEFAULT_TASK_TYPES;
	return raw
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
};

interface IStatusPayload {
	readonly available: readonly IProviderCandidate[];
}

interface IRecommendPayload {
	readonly ranked: readonly {
		readonly candidate: IProviderCandidate;
		readonly score: number;
		readonly rationale: string;
		readonly pinned: boolean;
	}[];
}

interface IUsageBucket {
	readonly key: string;
	readonly calls: number;
	readonly costUsd: number;
}

interface IUsageReportPayload {
	readonly windowDays: number;
	readonly buckets: readonly IUsageBucket[];
}

/** Render a row as text for the CLI table view. */
const projectRow = (r: {
	readonly providerId: string;
	readonly label: string;
	readonly costTier: number;
	readonly pinned: boolean;
	readonly bestRank: number | null;
	readonly spendUsd: number;
	readonly calls: number;
	readonly note: string;
}): Record<string, string> => ({
	provider: r.label,
	tier: String(r.costTier),
	pinned: r.pinned ? '★' : '',
	rank: r.bestRank === null ? '—' : `#${r.bestRank}`,
	spend: `$${r.spendUsd.toFixed(2)}`,
	calls: String(r.calls),
	note: r.note,
});

const textFor = (vm: ReturnType<typeof buildDashboard>): string => {
	const table = formatRows(vm.rows.map(projectRow), [
		'provider',
		'tier',
		'pinned',
		'rank',
		'spend',
		'calls',
		'note',
	]);
	return [`mcp-vertex router-dashboard`, `  ${vm.headline}`, '', table].join(
		'\n',
	);
};

const collectRecommendations = async (
	ctx: Parameters<NonNullable<ICliCommand['run']>>[1],
	taskTypes: readonly string[],
): Promise<readonly IRecommendationRow[]> => {
	const rows: IRecommendationRow[] = [];
	for (const taskType of taskTypes) {
		try {
			const payload = (await request<IRecommendPayload>(ctx, RECOMMEND, {
				taskType,
			})) as IRecommendPayload;
			rows.push({
				taskType,
				dial: 7,
				ranked: payload.ranked,
				pinnedId: payload.ranked.find((r) => r.pinned)?.candidate.id,
			});
		} catch {
			// Skip task types the selector can't rank — keeps the dashboard
			// useful even when one task type is unknown.
		}
	}
	return rows;
};

const routerDashboardCommand: ICliCommand = {
	name: 'router-dashboard',
	summary:
		'Show the recommendation + spend table for every reachable provider; --pin persists the choice.',
	async run(args, ctx) {
		const taskTypes = parseTaskTypes(scalarArg(args, 'task'));
		const windowDaysRaw = scalarArg(args, 'windowDays');
		const windowDays =
			windowDaysRaw !== undefined &&
			Number.isFinite(Number(windowDaysRaw))
				? Math.max(1, Math.floor(Number(windowDaysRaw)))
				: 7;

		const status = (await request<IStatusPayload>(
			ctx,
			STATUS,
			{},
		)) as IStatusPayload;
		const recommendations = await collectRecommendations(ctx, taskTypes);
		const usage = (await request<IUsageReportPayload>(ctx, USAGE, {
			groupBy: 'provider',
			windowDays,
		})) as IUsageReportPayload;

		const spendRows: readonly IProviderSpend[] = usage.buckets.map((b) => ({
			providerId: b.key,
			costUsd: b.costUsd,
			calls: b.calls,
		}));

		const vm = buildDashboard({
			available: status.available,
			recommendations,
			spend: {
				providers: spendRows,
				windowLabel: `last ${windowDays} day${windowDays === 1 ? '' : 's'}`,
			},
		});

		// --pin writes the pin back through the recommendation tool so the
		// router honours it on subsequent runs. The pin is task-type-scoped
		// to the first task type when several were requested.
		const pin = scalarArg(args, 'pin');
		if (pin !== undefined) {
			const first = taskTypes[0] ?? 'code-edit';
			await request(ctx, RECOMMEND, { taskType: first, pin });
			if (!ctx.globals.json) {
				return {
					code: EXIT_CODE.OK,
					text: `pinned ${pin} for task "${first}".\n${textFor(vm)}`,
				};
			}
		}

		if (ctx.globals.json || hasFlag(args, 'json')) {
			return data(vm);
		}
		return {
			code: EXIT_CODE.OK,
			text: `${textFor(vm)}\n`,
			data: vm,
		};
	},
};

export const routerDashboardCommands: readonly ICliCommand[] = [
	routerDashboardCommand,
];
