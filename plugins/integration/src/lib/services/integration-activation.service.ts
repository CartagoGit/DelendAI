/**
 * integration-activation.service.ts — switching the integration engine on
 * and off as product code: `activate` writes the engine and renders the
 * workflows only when the forge holds green rehearsal evidence for the
 * integration branch's tip, `deactivate` undoes both. Neither commits or
 * pushes: the caller publishes the change as a pull request.
 */
import { applyJsoncEdits, parseJsonc } from '@delendai/core/cli';

import { REHEARSAL_DEFERRED_TARGETS } from '../contracts/constants/rehearsal.constant';
import { ACTIVATION_MODES } from '../contracts/constants/integration-activation.constant';
import type {
	IActivationFile,
	IActivationMode,
	IActivationPorts,
	IActivationResult,
} from '../contracts/interfaces/integration-activation.interface';
import type { IDoctorReport } from '../contracts/interfaces/integration-doctor.interface';
import type {
	IRehearsalKnownRed,
	IRehearsalReport,
} from '../contracts/interfaces/rehearsal.interface';

const ENGINE_PATH = ['development', 'integration', 'engine'] as const;

/** The reasons one mode's report does not clear activation for `tip`. */
const reportRefusals = (
	mode: IActivationMode,
	tip: string,
	report: IRehearsalReport | undefined,
	required: readonly string[],
): readonly string[] => {
	if (report === undefined)
		return [
			`no ${mode} rehearsal report for ${tip}: dispatch the rehearsal workflow with mode ${mode} on this commit`,
		];
	if (report.tip !== tip)
		return [
			`the ${mode} rehearsal report is for ${report.tip}, not for ${tip}`,
		];
	const reasons: string[] = [];
	const played = new Set(report.scenarios.map((scenario) => scenario.id));
	const missing = required.filter((id) => !played.has(id));
	if (missing.length > 0)
		reasons.push(
			`the ${mode} rehearsal report does not cover the whole catalogue: missing ${missing.join(', ')}`,
		);
	if (report.scenarios.length === 0 || report.targets.length === 0)
		reasons.push(`the ${mode} rehearsal report measured nothing`);
	for (const scenario of report.scenarios)
		if (!scenario.ok)
			reasons.push(`${mode} scenario ${scenario.id} is red`);
	for (const target of report.targets) {
		if (target.notMeasured === true) {
			const deferred = REHEARSAL_DEFERRED_TARGETS[target.id];
			if (deferred === undefined)
				reasons.push(
					`${mode} target ${target.id} was not measured: ${target.detail}`,
				);
			continue;
		}
		if (!target.ok)
			reasons.push(
				`${mode} target ${target.id} is red: ${target.detail}`,
			);
	}
	return reasons;
};

/** Every reason activation is refused for `tip`, in a fixed order; empty means clear. */
export const activationRefusals = (input: {
	readonly tip: string;
	readonly reports: Readonly<
		Record<IActivationMode, IRehearsalReport | undefined>
	>;
	readonly knownRed: readonly IRehearsalKnownRed[];
	readonly doctor: IDoctorReport;
	/** The scenario ids `--scenarios=all` plays in each mode: that mode's report must hold every one. */
	readonly scenarioIds: Readonly<Record<IActivationMode, readonly string[]>>;
}): readonly string[] => [
	...ACTIVATION_MODES.flatMap((mode) =>
		reportRefusals(
			mode,
			input.tip,
			input.reports[mode],
			input.scenarioIds[mode],
		),
	),
	...input.knownRed.map(
		(red) =>
			`scenario ${red.scenario} is still known red (fixed by ${red.fixedBy})`,
	),
	...input.doctor.checks
		.filter((check) => !check.ok)
		.map((check) => `doctor check ${check.name} is red: ${check.detail}`),
];

/** The config text with the engine set; every comment, key and the member order survive. */
export const withEngine = (text: string, engine: 'land' | 'none'): string => {
	const { errors } = parseJsonc(text);
	if (errors.length > 0)
		throw new Error(
			'delendai.config.json does not parse: the engine is not written into a file that cannot be read.',
		);
	return applyJsoncEdits(text, [{ path: ENGINE_PATH, value: engine }]);
};

const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/** Write or remove one workflow file. */
const applyFile = (ports: IActivationPorts, file: IActivationFile) =>
	file.content === undefined
		? ports.removeWorkflow(file.path)
		: ports.writeWorkflow(file.path, file.content);

/**
 * Switch the engine all or nothing as far as the disk can: everything is
 * computed first, the workflows are applied next, and the config is written
 * last. A failing workflow restores the ones already touched and names both.
 * A re-run recomputes from the current files, so it converges.
 */
const switchEngine = async (
	ports: IActivationPorts,
	engine: 'land' | 'none',
): Promise<readonly string[]> => {
	const text = withEngine(await ports.readConfig(), engine);
	const files = await ports.renderWorkflows(text);
	const before = new Map<string, string | undefined>();
	for (const file of files)
		before.set(file.path, await ports.readWorkflow(file.path));
	const touched: IActivationFile[] = [];
	for (const file of files) {
		touched.push(file);
		try {
			await applyFile(ports, file);
		} catch (error) {
			const restored: string[] = [];
			const stuck: string[] = [];
			for (const done of touched) {
				try {
					await applyFile(ports, {
						path: done.path,
						content: before.get(done.path),
					});
					restored.push(done.path);
				} catch (restoreError) {
					stuck.push(`${done.path} (${messageOf(restoreError)})`);
				}
			}
			throw new Error(
				`the engine switch failed on ${file.path}: ${messageOf(error)}; ` +
					`restored: ${restored.join(', ') || 'none'}` +
					(stuck.length > 0
						? `; could not restore: ${stuck.join(', ')}`
						: '') +
					'; the config was not written, so running it again converges.',
			);
		}
	}
	await ports.writeConfig(text);
	return files.map((file) => file.path);
};

/** Activate the land engine when the evidence for the tip is green; refuse, listing every reason, when it is not. */
export const activateIntegration = async (
	ports: IActivationPorts,
): Promise<IActivationResult> => {
	const tip = await ports.tipOf();
	const [fast, real] = await Promise.all(
		ACTIVATION_MODES.map((mode) => ports.reportOf(mode, tip)),
	);
	const refusals = activationRefusals({
		tip,
		reports: { fast, real },
		knownRed: ports.knownRed,
		scenarioIds: ports.scenarioIds,
		doctor: await ports.doctor(),
	});
	if (refusals.length > 0) return { engine: 'none', refusals, changed: [] };
	return {
		engine: 'land',
		refusals,
		changed: await switchEngine(ports, 'land'),
	};
};

/** Return to engine none and drop the generated workflows; no gate. */
export const deactivateIntegration = async (
	ports: IActivationPorts,
): Promise<IActivationResult> => ({
	engine: 'none',
	refusals: [],
	changed: await switchEngine(ports, 'none'),
});
