/**
 * land-repair.helper.ts — the repair pass: when the integration branch's
 * latest completed CI run is red and still the tip, name the culprit merge
 * (`diagnoseDevelopRed`) and open its one revert (`openRepair`). A red no
 * merge's footprint reaches by a failing SPEC (a check name alone is a whole
 * zone, never an owner) reverts nobody and is reported `unowned`. Anything
 * else is a no-op, so running it again, or on every completed run, is safe.
 */
import { diagnoseDevelopRed } from './develop-red.helper';
import { failedIds, openRepair } from './land-revert.helper';
import type {
	ILandRepairPorts,
	ILandRepairResult,
} from './land-revert.interface';

const SPEC_ID = /\.spec\.[cm]?[jt]sx?$/u;
const RED = new Set(['failure', 'timed_out']);

export const repairDevelopRed = async (
	ports: ILandRepairPorts,
): Promise<ILandRepairResult> => {
	const { forge, note } = ports;
	const runs = await ports.recentRuns();
	const [latest] = runs;
	if (latest === undefined || !RED.has(latest.conclusion)) {
		// A finished green run knows no failures: its commit keeps an empty set.
		if (latest?.conclusion === 'success')
			await ports.develop.recordKnownFailing(latest.commit, []);
		return { kind: 'nothing', why: 'the latest CI run is not red' };
	}
	const tip = await forge.integrationTip();
	if (tip !== latest.commit)
		return { kind: 'nothing', why: 'the red run is no longer the tip' };
	// The last green is the newest SUCCESSFUL run: red and cancelled ones are skipped.
	const green = runs.find((run) => run.conclusion === 'success');
	if (green === undefined)
		return { kind: 'nothing', why: 'no green run to measure from' };
	const failing = failedIds(await forge.checks(latest.commit));
	const diagnosis = await diagnoseDevelopRed(ports.develop, {
		green: green.commit,
		red: {
			commit: latest.commit,
			failingSpecs: new Set(failing.filter((id) => SPEC_ID.test(id))),
			// A check name alone is a whole zone: any merge in it would
			// "reach" a red it did not cause. Only failing specs attribute.
			failingZones: new Set<string>(),
		},
	});
	// A failure no merge's footprint reaches belongs to nobody in this
	// range (a flaky or slow spec, an outage): reverting anyone would punish
	// unrelated work, so it stays an unowned failure, already recorded as
	// the known-failing set of its commit by `diagnoseDevelopRed`.
	const merge = diagnosis.revertFirst;
	if (merge === undefined)
		return {
			kind: 'unowned',
			why: 'no merge since the last green run reaches the failure',
			failing,
		};
	return openRepair({
		forge,
		git: ports.git,
		tip,
		repairPrefix: ports.repairPrefix,
		merge,
		failing,
		known: [],
		note,
	});
};
