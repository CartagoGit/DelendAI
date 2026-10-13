/**
 * delendai-session.service.ts — marks every process delendai starts.
 */
import { DELENDAI_SESSION_VARIABLE } from '@delendai/core/cli';

/**
 * Exports the session marker into `env`, so every process this one starts
 * (git included) inherits it and a call made through delendai is an
 * agent's whatever its host sets. The guard is the exception: it runs
 * inside git and judges the process that called git, not itself.
 */
export const markDelendaiSession = (
	argv: readonly string[],
	env: NodeJS.ProcessEnv,
): void => {
	if (argv[0] === 'guard') return;
	if ((env[DELENDAI_SESSION_VARIABLE] ?? '').trim().length > 0) return;
	env[DELENDAI_SESSION_VARIABLE] = '1';
};
