import {
	anchorFromPolicy,
	anchorRefusal,
	observeAnchor,
} from '../wip-engine/index';
import { isAdoptedPolicy } from '../development-policy/served-work-model';
import { checkedOutBranch } from '../development-policy/project-branches';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { readSwarm } from './work-swarm.service';
import { reportDirtyPaths } from './work-dirty-paths.service';
import { renderInvariantReport } from './workflow-invariants.service';
import { runWorkflowDoctor } from './workflow-doctor.service';

import {
	gitVerbatim,
	integrationBase,
	openWork,
	refused,
	undurableAdvice,
	workspaceOf,
} from './work-unit-shared.service';

const anchoredLine = (payload: {
	readonly anchorRequired: boolean;
	readonly anchored: boolean;
	readonly anchorRefusal: string | null;
}): string => {
	if (!payload.anchorRequired) {
		return 'not required (this profile does not anchor the checkout)';
	}
	return payload.anchored ? 'yes' : `NO — ${payload.anchorRefusal ?? ''}`;
};

/** Says so when the project wrote no model and delendai adopted one. */
const adoptedNote = (policy: IResolvedDevelopmentPolicy): string =>
	isAdoptedPolicy(policy)
		? ' (adopted: this project declares no `development` block)'
		: '';

export const statusOf = async (
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const { root, policy, engine } = opened;
	const anchor = anchorRefusal(
		await observeAnchor(engine.context.run, anchorFromPolicy(policy)),
	);
	const branch = checkedOutBranch(root);
	const paths = reportDirtyPaths({
		git: (args) => gitVerbatim(root, args),
		refs: readSwarm({ root, policy }).units,
	});
	const payload = {
		profile: policy.profile,
		policySource: policy.source,
		integration: policy.branches.integration,
		branch: branch ?? null,
		pinnedCheckout: policy.workspace.pinnedCheckout,
		agentWorktrees: policy.workspace.agentWorktrees,
		anchorRequired: policy.workspace.anchoredToIntegrationBranch,
		anchored:
			policy.workspace.anchoredToIntegrationBranch &&
			anchor === undefined,
		anchorRefusal: anchor ?? null,
		workRefTemplate: policy.branches.workRefTemplate,
		base: integrationBase(root, policy) ?? null,
		dirty: paths.dirty,
		undurable: paths.undurable,
	};
	if (ctx.globals.json || ctx.globals.format === 'json') {
		return { code: EXIT_CODE.OK, data: payload };
	}
	process.stdout.write(
		`${[
			`profile          ${payload.profile}${adoptedNote(policy)}`,
			`integration      ${payload.integration}`,
			`checkout on      ${payload.branch ?? '(detached)'}`,
			`anchored         ${anchoredLine(payload)}`,
			`work ref shape   ${payload.workRefTemplate.length > 0 ? payload.workRefTemplate : '(none: this profile commits directly)'}`,
			`dirty paths      ${String(payload.dirty.length)}`,
			`undurable        ${String(payload.undurable.length)}`,
			...undurableAdvice(payload.undurable),
		].join('\n')}\n`,
	);
	return { code: EXIT_CODE.OK, data: payload, suppressDefaultPrint: true };
};

/**
 * What everyone else is doing, before the first edit.
 *
 * A claim is consulted when a write is attempted, which is after the
 * work exists; this answers the question that avoids the collision
 * instead of detecting it.
 */
export const swarm = async (
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const view = readSwarm({ root: opened.root, policy: opened.policy });
	if (ctx.globals.json || ctx.globals.format === 'json') {
		return { code: EXIT_CODE.OK, data: view };
	}
	const lines = [
		`integration      ${view.integration}`,
		`units of work    ${String(view.units.length)}`,
		...view.units.map(
			(unit) =>
				`  ${unit.agent}  ${unit.subject}  +${String(unit.ahead)}/-${String(unit.behind)}  ${String(unit.paths.length)} path(s)`,
		),
		`publications     ${String(view.publications.length)}`,
		...view.publications.map((name) => `  ${name}`),
		...(view.overlaps.length === 0
			? ['overlaps         none']
			: [
					`overlaps         ${String(view.overlaps.length)} path(s) more than one unit of work is changing:`,
					...view.overlaps.map(
						(overlap) =>
							`  ${overlap.path} — ${overlap.refs.join(', ')}`,
					),
				]),
	];
	process.stdout.write(`${lines.join('\n')}\n`);
	return { code: EXIT_CODE.OK, data: view, suppressDefaultPrint: true };
};

/**
 * Ask whether the work-ref model is actually holding.
 *
 * Read-only by construction: a checker that also repairs cannot be run
 * to find out whether repair was needed.
 */
export const doctored = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const report = await runWorkflowDoctor({
		from: workspaceOf(ctx),
		...(args.includes('--forge') ? { scopes: ['forge' as const] } : {}),
	});
	if (report === undefined) {
		return refused(
			`${workspaceOf(ctx)} is not inside a git working tree.`,
			'Run this from the repository, or pass --workspace=<path>.',
		);
	}
	if (ctx.globals.json || ctx.globals.format === 'json') {
		return {
			code: report.broken === 0 ? EXIT_CODE.OK : EXIT_CODE.VALIDATION,
			data: report,
		};
	}
	process.stdout.write(`${renderInvariantReport(report)}\n`);
	return {
		code: report.broken === 0 ? EXIT_CODE.OK : EXIT_CODE.VALIDATION,
		data: report,
		suppressDefaultPrint: true,
	};
};
