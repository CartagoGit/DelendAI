#!/usr/bin/env bun
/**
 * cli-i18n.script.ts - f00034 s7 (gate).
 *
 * The CLI advertises a fixed help locale set. This gate keeps the declared
 * locale list, translation table and registered command summaries in sync.
 */
import { registerAllCommands } from '../../../packages/cli/src/commands/registry';
import {
	HELP_TRANSLATIONS,
	SUPPORTED_HELP_LANGS,
} from '../../../packages/cli/src/contracts/constants/help-translation.constant';

export interface ICliI18nFinding {
	readonly lang: string;
	readonly reason: string;
}

export interface ICliI18nReport {
	readonly langs: readonly string[];
	readonly commands: readonly string[];
	readonly findings: readonly ICliI18nFinding[];
}

export const detectCliI18n = async (): Promise<ICliI18nReport> => {
	const langs = [...SUPPORTED_HELP_LANGS];
	const commands = (await registerAllCommands()).map(
		(command) => command.name,
	);
	const findings: ICliI18nFinding[] = [];

	for (const lang of langs) {
		const translation = HELP_TRANSLATIONS[lang];
		if (translation === undefined) {
			findings.push({
				lang,
				reason: 'missing CLI help translation block',
			});
			continue;
		}
		for (const command of commands) {
			if (translation.commandSummaries[command] === undefined) {
				findings.push({
					lang,
					reason: `missing summary for command "${command}"`,
				});
			}
		}
	}

	for (const lang of Object.keys(HELP_TRANSLATIONS)) {
		if (!langs.includes(lang as any)) {
			findings.push({
				lang,
				reason: 'translation exists but language is not declared in SUPPORTED_HELP_LANGS',
			});
		}
	}

	return { langs, commands, findings };
};

export const formatReport = (report: ICliI18nReport): string => {
	if (report.findings.length === 0) {
		return `cli-i18n: ${report.langs.length} languages cover ${report.commands.length} commands.\n`;
	}
	const lines = [
		`cli-i18n: ${report.findings.length} finding${report.findings.length === 1 ? '' : 's'}.`,
		'',
	];
	for (const finding of report.findings) {
		lines.push(`  ${finding.lang}: ${finding.reason}`);
	}
	lines.push(
		'',
		'Update packages/cli/src/contracts/constants/help-translation.constant.ts so every declared help locale covers every registered CLI command.',
	);
	return `${lines.join('\n')}\n`;
};

export const main = async (): Promise<number> => {
	const report = await detectCliI18n();
	const text = formatReport(report);
	if (report.findings.length === 0) {
		process.stdout.write(text);
		return 0;
	}
	process.stderr.write(text);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
