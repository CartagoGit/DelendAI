/**
 * legacy-residue.check.ts — what an older delendai left on this machine:
 * user-level host config entries under the retired name, old clones and
 * stale processes. Reading only; each finding carries the command or the
 * edit that clears it. Nothing is killed, deleted or rewritten here.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
	scanLegacyResidue,
	stringHasLegacyIdentity,
	thisMachineResidueOptions,
} from '@delendai/core/cli';

import type { ILegacyResidueProbe } from '../../../contracts/interfaces/legacy-residue-probe.interface';
import type { DoctorCheck } from '../types';

const listProcesses = async (): Promise<readonly string[]> => {
	try {
		const { stdout } = await promisify(execFile)('ps', [
			'-eo',
			'pid=,args=',
		]);
		return stdout.split('\n').map((line) => line.trim());
	} catch {
		return [];
	}
};

export const defaultLegacyResidueProbe: ILegacyResidueProbe = {
	scan: (workspace) =>
		scanLegacyResidue(thisMachineResidueOptions(workspace)),
	processes: listProcesses,
};

export const checkLegacyResidue =
	(probe: ILegacyResidueProbe = defaultLegacyResidueProbe): DoctorCheck =>
	async (ctx) => {
		const report = await probe.scan(ctx.workspace);
		const findings: string[] = [];
		for (const change of report.changes) {
			findings.push(
				`${change.entries.join(', ')} in ${change.file} is delendai's own under the retired name: run \`delendai doctor --fix\` (a backup is written first)`,
			);
		}
		for (const question of report.questions) {
			findings.push(
				`${question.entry} in ${question.file} mentions the retired name but is not provably delendai's own: edit or remove it by hand`,
			);
		}
		for (const failure of report.failures) {
			findings.push(
				`${failure.file} could not be read: ${failure.reason}`,
			);
		}
		for (const clone of report.clones) {
			findings.push(
				`old clone at ${clone}: when nothing launches from it, remove it with \`rm -rf ${clone}\``,
			);
		}
		for (const line of await probe.processes()) {
			const [pid = '', ...command] = line.split(/\s+/u);
			const text = command.join(' ');
			if (!stringHasLegacyIdentity(text) || text.includes('doctor'))
				continue;
			findings.push(
				`stale process ${pid} (${text.slice(0, 80)}): stop it with \`kill ${pid}\``,
			);
		}
		return findings.length === 0
			? {
					name: 'legacy-residue',
					status: 'ok',
					findings: ['nothing left by an older delendai'],
				}
			: { name: 'legacy-residue', status: 'warn', findings };
	};
