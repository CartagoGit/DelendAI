/**
 * land-repair.helper.ts — the repair pass: when the integration branch's
 * latest completed CI run is red and still the tip, name the culprit merge
 * (`diagnoseDevelopRed`) and open its one revert (`openRepair`). Anything
 * else is a no-op, so running it again, or on every completed run, is safe.
 */
import { diagnoseDevelopRed } from './develop-red.helper';
import { failedIds, openRepair } from './land-revert.helper';
import type {
	ILandRepairPorts,
	ILandRepairResult,
} from './land-revert.interface';

const RED = new Set(['failure', 'timed_out']);

export const repairDevelopRed = async (
	ports: ILandRepairPorts,
): Promise<ILandRepairResult> => {
	const { forge, note } = ports;
	const runs = await ports.recentRuns();
	const [latest] = runs;
	if (latest === undefined || !RED.has(latest.conclusion))
		return { kind: 'nothing', why: 'the latest CI run is not red' };
	const tip = await forge.integrationTip();
	if (tip !== latest.commit)
		return { kind: 'nothing', why: 'the red run is no longer the tip' };
	// The last green is the newest SUCCESSFUL run: red and cancelled ones are skipped.
	const green = runs.find((run) => run.conclusion === 'success');
	if (green === undefined)
		return { kind: 'nothing', why: 'no green run to measure from' };
	const failing = failedIds(await forge.checks(latest.commit));
	const zones = new Set<string>();
	for (const name of failing) {
		const zone = ports.sectionOfCheck(name);
		if (zone !== undefined) zones.add(zone);
	}
	const diagnosis = await diagnoseDevelopRed(ports.develop, {
		green: green.commit,
		red: {
			commit: latest.commit,
			failingSpecs: new Set(failing),
			failingZones: zones,
		},
	});
	// Nobody's footprint reaches a failure known only by its check's name:
	// the earliest merge since the last green is then tried first, as the
	// suspects of an unowned failure always are.
	const [earliest] =
		diagnosis.revertFirst === undefined
			? await ports.develop.mergesBetween(green.commit, latest.commit)
			: [];
	const merge = diagnosis.revertFirst ?? earliest;
	if (merge === undefined)
		return {
			kind: 'nothing',
			why: 'no merge between the last green run and the red one',
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
