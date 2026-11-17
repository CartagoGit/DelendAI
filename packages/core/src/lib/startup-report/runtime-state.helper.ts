import { RUNTIME_STATE_ENV } from '../contracts/constants/runtime-state.constant';
import type { IRuntimeState } from '../contracts/interfaces/runtime-state.interface';

/** The state the host put in `env`, or `undefined` when it set none or it is malformed. */
export const readRuntimeState = (
	env: NodeJS.ProcessEnv = process.env,
): IRuntimeState | undefined => {
	const raw = env[RUNTIME_STATE_ENV];
	if (raw === undefined || raw.length === 0) return undefined;
	try {
		const parsed = JSON.parse(raw) as IRuntimeState;
		return parsed.kind === 'tag' || parsed.kind === 'branch'
			? parsed
			: undefined;
	} catch {
		return undefined;
	}
};

/** The one sentence for a runtime state: boot summary, status tool and editor tooltip all show it. */
export const describeRuntimeState = (state: IRuntimeState): string => {
	if (state.kind === 'tag') return `tag ${state.tag ?? 'unknown'}`;
	const name = state.branch ?? 'unknown';
	const place =
		state.ahead === 0 && state.behind === 0
			? `level with origin/${name}`
			: [
					...(state.ahead > 0 ? [`ahead ${state.ahead}`] : []),
					...(state.behind > 0 ? [`behind ${state.behind}`] : []),
				].join(', ');
	return `${name}@${state.sha12 ?? 'unknown'} ${place}${state.dirty ? ', dirty' : ''}`;
};
