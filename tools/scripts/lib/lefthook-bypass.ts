/**
 * lefthook-bypass.ts — x00159 S2.
 *
 * Every BLOCKING lint script under `tools/scripts/lint/` prints the
 * same documented escape hatch in its blocker text: `LEFTHOOK_BYPASS=1
 * git commit/push ...`. That variable is never lefthook's own —
 * lefthook's real kill-switch is `LEFTHOOK=0`, which skips every hook
 * unconditionally (including the advisory ones). `LEFTHOOK_BYPASS`
 * was a promise with nothing behind it: setting it changed nothing,
 * so the hook still blocked and the printed remedy silently lied.
 *
 * This makes the documented promise real without touching lefthook's
 * generated shell wrapper: each blocking script checks this helper
 * first and self-skips when the operator explicitly opted in.
 */

export const LEFTHOOK_BYPASS_ENV_VAR = 'LEFTHOOK_BYPASS';

/** True when the operator explicitly set `LEFTHOOK_BYPASS=1`. */
export const isLefthookBypassed = (
	env: NodeJS.ProcessEnv = process.env,
): boolean => env[LEFTHOOK_BYPASS_ENV_VAR] === '1';
