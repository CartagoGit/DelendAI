/**
 * ci-environment.helper.ts — whether this process runs in the project's CI.
 *
 * One reader for every gate that treats a CI job's throwaway checkout
 * differently from a shared one. It used to be asked five ways, three of
 * them a literal GitHub variable, which is false on any other forge, and
 * one a bare `CI=true`, which agent shells export too.
 *
 * A CI provider names itself with a variable of its own; `CI=true` is the
 * generic convention and counts only when no agent drives the process.
 */
import {
	CI_PROVIDER_VARIABLES,
	CI_VARIABLES_OVERRIDE,
} from '../contracts/constants/ci-environment.constant';
import { agentEnvironmentMarker } from './agent-environment.helper';

type IEnvironment = Readonly<Record<string, string | undefined>>;

const isSet = (env: IEnvironment, name: string): boolean =>
	(env[name] ?? '').trim().length > 0 && env[name] !== 'false';

/**
 * The variable showing this process runs in the project's CI, or
 * `undefined`. A provider's own variable decides on its own; `CI=true`
 * decides only while no agent marker is set, because agent runtimes
 * export `CI=1` to switch off prompts and their shells are not CI.
 */
export const ciEnvironmentMarker = (
	env: IEnvironment = process.env,
): string | undefined => {
	const declared = (env[CI_VARIABLES_OVERRIDE] ?? '')
		.split(',')
		.map((name) => name.trim())
		.filter((name) => name.length > 0);
	const provider = [...CI_PROVIDER_VARIABLES, ...declared].find((name) =>
		isSet(env, name),
	);
	if (provider !== undefined) return provider;
	const generic = env.CI === 'true' || env.CI === '1';
	return generic && agentEnvironmentMarker(env) === undefined
		? 'CI'
		: undefined;
};

/** Whether this process runs in the project's CI. */
export const isRunningInProjectCi = (
	env: IEnvironment = process.env,
): boolean => ciEnvironmentMarker(env) !== undefined;
