/**
 * validation-gate-steps.service.ts — which gates a project declares.
 *
 * One reading for everything that runs them: `delendai validate` in the
 * shared checkout, and the certification that stands between a work ref
 * and the integration branch under the merge model. Two readings would
 * let a project pass one gate and land through another.
 *
 * The declaration is `validationMatrix.scopes` in `delendai.config.json`,
 * else the project's own `validate` script run by its own package
 * manager. The files come through a reader, so the certification can read
 * them from the integration head — the gate is the branch's, never the
 * candidate's own, or a unit could land by weakening the gate it carries.
 */
import { parseJsonc } from '../config/jsonc-document';

import type {
	IDeclarationReader,
	IValidationGateStep,
} from '../contracts/interfaces/local-certification.interface';

const readJson = (
	read: IDeclarationReader,
	path: string,
): Record<string, unknown> | undefined => {
	const text = read(path);
	if (text === undefined) return undefined;
	try {
		const { value } = parseJsonc(text);
		return typeof value === 'object' && value !== null
			? (value as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
};

const LOCKFILES: readonly (readonly [string, string])[] = [
	['bun.lock', 'bun'],
	['bun.lockb', 'bun'],
	['pnpm-lock.yaml', 'pnpm'],
	['yarn.lock', 'yarn'],
];

/** The package manager the project's lockfile names; npm when none does. */
export const packageManagerFrom = (read: IDeclarationReader): string =>
	LOCKFILES.find(([lock]) => read(lock) !== undefined)?.[1] ?? 'npm';

/**
 * The steps the project declares, in order: every command of every
 * `validationMatrix` scope, else its `validate` package script. Empty
 * when it declares neither.
 */
export const validationGateSteps = (
	read: IDeclarationReader,
): readonly IValidationGateStep[] => {
	const matrix = readJson(read, 'delendai.config.json')?.validationMatrix as
		| { readonly scopes?: Record<string, readonly { command?: unknown }[]> }
		| undefined;
	const fromMatrix = Object.entries(matrix?.scopes ?? {}).flatMap(
		([scope, gates]) =>
			gates.flatMap((gate) =>
				typeof gate.command === 'string' && gate.command.trim() !== ''
					? [{ scope, command: gate.command }]
					: [],
			),
	);
	if (fromMatrix.length > 0) return fromMatrix;
	const scripts = readJson(read, 'package.json')?.scripts as
		| Record<string, unknown>
		| undefined;
	return typeof scripts?.validate === 'string'
		? [
				{
					scope: 'package',
					command: `${packageManagerFrom(read)} run validate`,
				},
			]
		: [];
};
