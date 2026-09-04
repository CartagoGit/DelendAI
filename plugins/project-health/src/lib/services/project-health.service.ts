/**
 * project-health.service.ts — f00166: the compact aggregator. Turns
 * cheap signals (see `project-health-signals.service.ts`) into a
 * summary + per-domain `next` actions, or into a lazy hint for a
 * single requested domain. Heavy scanners stay on-demand in the real
 * domain plugins; this service never invokes them.
 */
import { truncateIfTooLarge } from '@delendai/core/public';

import {
	DEFAULT_PROJECT_HEALTH_MAX_BYTES,
	PROJECT_HEALTH_DEPENDS_ON,
	PROJECT_HEALTH_DOMAIN_TOOLS,
	PROJECT_HEALTH_MAX_HINT_LENGTH,
} from '../contracts/constants/project-health.constant';
import type {
	IProjectHealthNextAction,
	IProjectHealthOutput,
	IProjectHealthScore,
	IProjectHealthSignals,
	IProjectHealthToolArgs,
	IProjectHealthToolOptions,
	TProjectHealthDomain,
} from '../contracts/interfaces/project-health.interface';
import { summarizeSignals } from './project-health-signals.service';

const truncateHint = (value: string): string =>
	value.length <= PROJECT_HEALTH_MAX_HINT_LENGTH
		? value
		: `${value.slice(0, PROJECT_HEALTH_MAX_HINT_LENGTH - 1)}…`;

export const buildNextActions = (
	score: IProjectHealthScore,
	signals: IProjectHealthSignals,
): IProjectHealthNextAction[] => {
	const actions: IProjectHealthNextAction[] = [];
	if (score.security < 100) {
		actions.push({
			tool: PROJECT_HEALTH_DOMAIN_TOOLS.security,
			reason:
				signals.suspiciousPaths.length > 0
					? `Bounded filename scan found ${signals.suspiciousPaths.length} suspicious path(s).`
					: 'Summary security signal is weak by design; run the real secret scanner for findings.',
		});
	}
	if (score.deps < 100) {
		actions.push({
			tool: PROJECT_HEALTH_DOMAIN_TOOLS.deps,
			reason:
				signals.lockfile === undefined
					? 'No lockfile was detected in the workspace root.'
					: `Dependency health still needs the real audit beyond the ${signals.lockfile} lockfile signal.`,
		});
	}
	if (score.quality < 100) {
		actions.push({
			tool: PROJECT_HEALTH_DOMAIN_TOOLS.quality,
			reason:
				signals.qualityScopes.length === 0
					? 'No resolved quality scopes were found from package scripts or validation matrix.'
					: `Resolved scopes (${signals.qualityScopes.join(', ')}) still need real execution results.`,
		});
	}
	if (score.debt < 100) {
		actions.push({
			tool: PROJECT_HEALTH_DOMAIN_TOOLS.debt,
			reason: `Bounded sample found ${signals.markerCount} debt marker(s) across ${signals.sampledFiles} file(s).`,
		});
	}
	return actions.length > 0
		? actions
		: [
				{
					tool: PROJECT_HEALTH_DOMAIN_TOOLS.quality,
					reason: 'All summary heuristics are green; run a real domain tool for ground truth if needed.',
				},
			];
};

export const buildDomainHint = (
	domain: Exclude<TProjectHealthDomain, 'summary'>,
	signals: IProjectHealthSignals,
): string => {
	switch (domain) {
		case 'security':
			return truncateHint(
				signals.suspiciousPaths.length > 0
					? `Lazy detail only. Summary saw suspicious filenames: ${signals.suspiciousPaths.join(', ')}. Call ${PROJECT_HEALTH_DOMAIN_TOOLS.security} for actual file-content scanning.`
					: `Lazy detail only. Summary security uses bounded filename signals and found no suspicious names. Call ${PROJECT_HEALTH_DOMAIN_TOOLS.security} for actual scanning.`,
			);
		case 'deps':
			return truncateHint(
				signals.lockfile === undefined
					? `Lazy detail only. No root lockfile was detected. Call ${PROJECT_HEALTH_DOMAIN_TOOLS.deps} for a real dependency audit.`
					: `Lazy detail only. Summary detected ${signals.lockfile}. Call ${PROJECT_HEALTH_DOMAIN_TOOLS.deps} for vulnerability details.`,
			);
		case 'quality':
			return truncateHint(
				`Lazy detail only. Summary resolved ${signals.qualityScopes.length} scope(s)${signals.qualityScopes.length > 0 ? `: ${signals.qualityScopes.join(', ')}` : ''}. Call ${PROJECT_HEALTH_DOMAIN_TOOLS.quality} to execute them.`,
			);
		case 'debt':
			return truncateHint(
				`Lazy detail only. Summary sampled ${signals.sampledFiles} file(s) and found ${signals.markerCount} marker(s). Call ${PROJECT_HEALTH_DOMAIN_TOOLS.debt} for the full debt scan.`,
			);
	}
};

export const finalizeOutput = (
	raw: Omit<IProjectHealthOutput, 'bytes' | 'truncated' | 'originalBytes'>,
	maxBytes: number,
): IProjectHealthOutput => {
	const direct = truncateIfTooLarge(raw, maxBytes);
	if (!direct.truncated) {
		return { ...raw, bytes: direct.finalBytes, truncated: false };
	}
	const next = raw.next ?? [];
	const maybeHint =
		raw.hint === undefined ? {} : { hint: truncateHint(raw.hint) };
	const candidates: Omit<
		IProjectHealthOutput,
		'bytes' | 'truncated' | 'originalBytes'
	>[] = [
		{
			...raw,
			next: next.slice(0, 4).map((item) => ({
				tool: item.tool,
				reason: truncateHint(item.reason),
			})),
		},
		{
			...raw,
			next: next.slice(0, 2).map((item) => ({
				tool: item.tool,
				reason: truncateHint(item.reason),
			})),
			...maybeHint,
		},
		{
			...raw,
			next: [],
			...maybeHint,
		},
	];
	for (const candidate of candidates) {
		const bounded = truncateIfTooLarge(candidate, maxBytes);
		if (!bounded.truncated) {
			return {
				...candidate,
				bytes: bounded.finalBytes,
				truncated: true,
				originalBytes: direct.originalBytes,
			};
		}
	}
	const minimal = { ...raw, next: [], ...maybeHint };
	const fallback = truncateIfTooLarge(minimal, maxBytes);
	return {
		...minimal,
		bytes: fallback.finalBytes,
		truncated: true,
		originalBytes: direct.originalBytes,
	};
};

export const buildProjectHealthPayload = async (
	args: IProjectHealthToolArgs,
	options: IProjectHealthToolOptions,
): Promise<IProjectHealthOutput> => {
	const domain = args.domain ?? 'summary';
	const maxBytes = options.maxBytes || DEFAULT_PROJECT_HEALTH_MAX_BYTES;
	const signals = await summarizeSignals(options);
	if (domain !== 'summary') {
		return finalizeOutput(
			{
				domain,
				tool: PROJECT_HEALTH_DOMAIN_TOOLS[domain],
				hint: buildDomainHint(domain, signals),
				dependsOn: [...PROJECT_HEALTH_DEPENDS_ON],
			},
			maxBytes,
		);
	}
	const score = signals.score;
	return finalizeOutput(
		{
			...score,
			next: buildNextActions(score, signals),
			dependsOn: [...PROJECT_HEALTH_DEPENDS_ON],
		},
		maxBytes,
	);
};
