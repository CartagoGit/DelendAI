/**
 * workflow-kpis.service.ts — the state of the work model as numbers.
 *
 * Composes what the doctor, the swarm view and the roster already
 * compute, so a KPI surface reports them without a second reading of the
 * same facts. The doctor runs in the `checkout` scope only: a KPI must
 * never wait on the network.
 */
import type { IWorkflowKpis } from '../contracts/interfaces/workflow-kpis.interface';
import { readCoordinationCost } from './coordination-cost.service';
import { rosterOf } from './swarm-roster.service';
import { readUnitStandings } from './unit-standings.service';
import { readSwarm } from './work-swarm.service';
import {
	policyOf,
	runWorkflowDoctor,
	sharedCheckoutOf,
} from './workflow-doctor.service';

/** The days the coordination cost is measured over. */
const COORDINATION_WINDOW_DAYS = 7;

const withCoordination = (
	cost: ReturnType<typeof readCoordinationCost>,
): { readonly coordination?: NonNullable<typeof cost> } =>
	cost === undefined ? {} : { coordination: cost };

/** The work model's numbers, or undefined outside a git repository. */
export const readWorkflowKpis = async (
	from: string,
): Promise<IWorkflowKpis | undefined> => {
	const root = sharedCheckoutOf(from);
	if (root === undefined) return undefined;
	const report = await runWorkflowDoctor({ from, scopes: ['checkout'] });
	if (report === undefined) return undefined;
	const policy = await policyOf(root);
	const view = readSwarm({ root, policy });
	const standings = await readUnitStandings({ root, policy });
	const roster = rosterOf(view, standings);
	const brokenIds = report.results
		.filter((result) => !result.holds)
		.map((result) => result.id);
	return {
		invariants: {
			total: report.results.length,
			broken: report.broken,
			brokenIds,
		},
		units: view.units.length,
		publicationsWaiting: view.published.filter((unit) => unit.ahead > 0)
			.length,
		agents: roster.length,
		agentsThatProducedNothing: roster.filter((each) => each.producedNothing)
			.length,
		...withCoordination(
			readCoordinationCost(
				root,
				policy.branches.integration,
				COORDINATION_WINDOW_DAYS,
			),
		),
	};
};
