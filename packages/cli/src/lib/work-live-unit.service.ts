/**
 * work-live-unit.service.ts — which unit a command run outside any unit's
 * worktree means.
 *
 * `work deliver` with no unit flag and no unit in the current directory
 * assumed the slice `all`, and failed with a ref that resolves to no commit.
 * A command never guesses its unit: it finds the agent's one live unit of
 * the proposal, or refuses and lists the candidates with the exact command.
 */
import type { IUnitStandingEntry } from '@delendai/core/cli';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICliCommandResult } from '../contracts/interfaces/cli-command.interface';
import type {
	ILiveUnit,
	ILiveUnitIdentity,
} from '../contracts/interfaces/work-live-unit.interface';

/** Standings that still hold a unit: its work is not delivered or gone. */
const ENDED_STANDINGS: ReadonlySet<string> = new Set([
	'abandoned',
	'delivered',
]);

/** The units of `agent` for `proposal` that are still live, in ref order. */
export const liveUnitsOf = (
	entries: readonly IUnitStandingEntry[],
	input: { readonly agent: string; readonly proposal: string },
	parse: (ref: string) => ILiveUnitIdentity | undefined,
): readonly ILiveUnit[] =>
	entries
		.filter((entry) => !ENDED_STANDINGS.has(entry.standing))
		.flatMap((entry) => {
			const unit = parse(`refs/heads/${entry.ref}`);
			return unit?.agent === input.agent &&
				unit.proposal === input.proposal
				? [{ ...unit, ref: entry.ref, worktree: entry.worktree }]
				: [];
		})
		.sort((a, b) => a.ref.localeCompare(b.ref));

/** The unit flags that name `unit`. */
export const flagsOfLiveUnit = (unit: ILiveUnit): readonly string[] => [
	`--kind=${unit.kind}`,
	`--slice=${unit.slice}`,
	`--generation=${String(unit.generation)}`,
	...(unit.topic === undefined ? [] : [`--topic=${unit.topic}`]),
];

/** The exact command that delivers `unit`, run from its worktree. */
const commandFor = (unit: ILiveUnit, verb: string): string =>
	`${unit.worktree === null ? '' : `cd ${unit.worktree} && `}delendai work ${verb} --proposal=${unit.proposal} ${flagsOfLiveUnit(unit).join(' ')} --agent=${unit.agent}`;

/**
 * The only live unit, or the refusal that names none or the several.
 * Never a guess: the caller adds nothing to the flags on a refusal.
 */
export const chooseLiveUnit = (
	units: readonly ILiveUnit[],
	input: {
		readonly agent: string;
		readonly proposal: string;
		readonly verb: string;
	},
): { readonly unit: ILiveUnit } | { readonly refusal: ICliCommandResult } => {
	const [only] = units;
	if (units.length === 1 && only !== undefined) return { unit: only };
	const who = `${input.agent} has`;
	const lines =
		units.length === 0
			? [
					`work ${input.verb}: no unit flag was given, this directory holds no unit, and ${who} no live unit of ${input.proposal}.`,
					`Enter one (delendai work enter --proposal=${input.proposal} --slice=<id> --agent=${input.agent}) or name it with --slice, --generation and --kind.`,
				]
			: [
					`work ${input.verb}: no unit flag was given, this directory holds no unit, and ${who} ${String(units.length)} live units of ${input.proposal}:`,
					...units.map((unit) => `  ${commandFor(unit, input.verb)}`),
					'Run one of them.',
				];
	return {
		refusal: { code: EXIT_CODE.VALIDATION, error: lines.join('\n') },
	};
};
