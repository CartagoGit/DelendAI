/**
 * Pure safe-report shaping helpers for the auto-reporting plugin.
 * Everything here is side-effect free so the classification,
 * fingerprint and body logic are unit-testable without touching a real
 * process, the filesystem or the network.
 */
import { createHash } from 'node:crypto';

import { renderChangeText } from '@delendai/core/public';

import type { ISafeDelendaiReport } from './contracts/interfaces/reporter.interface';
import type { ISafeFingerprintInput } from './contracts/interfaces/signature.interface';
export {
	classifyInternalError,
	classificationFromEvidence,
	classificationOf,
	isDelendaiInternal,
	isMarkedInternalBoundary,
	markErrorAsInternalBoundary,
	registerInternalPath,
	registerInternalRuntimePaths,
	resetInternalPathRegistry,
	safeFailureClassOf,
} from './internal-classifier.helper';

const MAX_TITLE_LENGTH = 180;

const packageRank = (value: string): number => {
	if (value.startsWith('@delendai/error-reporting/')) return 0;
	if (value.startsWith('@delendai/core/')) return 1;
	if (value.startsWith('@delendai/')) return 2;
	return 3;
};

const versionMajorMinorOf = (version: string): string => {
	const [major = '0', minor = '0'] = version.split('.');
	return `${major}.${minor}`;
};

const topInternalFrameRelativeOf = (
	frame: ISafeFingerprintInput['mcpFrames'][number] | undefined,
): string => {
	if (frame === undefined) return '';
	const suffix =
		frame.line !== undefined
			? `:${frame.line}${frame.col !== undefined ? `:${frame.col}` : ''}`
			: '';
	return `${frame.file}${suffix}`;
};

const componentIdOf = (input: ISafeFingerprintInput): string => {
	if (input.componentId !== undefined) return input.componentId;
	const topFrame = [...input.mcpFrames].sort(
		(left, right) => packageRank(left.file) - packageRank(right.file),
	)[0];
	if (topFrame === undefined) return '';
	const prefix = `${input.packageId}/`;
	if (!topFrame.file.startsWith(prefix)) return topFrame.file;
	return topFrame.file.slice(prefix.length);
};

export const signatureOf = (input: ISafeFingerprintInput): string => {
	const firstFrame = [...input.mcpFrames].sort(
		(left, right) => packageRank(left.file) - packageRank(right.file),
	)[0];
	return createHash('sha256')
		.update(
			[
				versionMajorMinorOf(input.delendaiVersion),
				input.packageId,
				componentIdOf(input),
				input.errorCode ?? '',
				topInternalFrameRelativeOf(firstFrame),
			].join('\n'),
		)
		.digest('hex');
};

const truncate = (value: string, max: number): string =>
	value.length > max ? `${value.slice(0, max - 1)}…` : value;

/**
 * The issue text, rendered by the one template (f00809) and built only
 * from the controlled, internal-safe vocabulary of the safe DTO.
 */
const renderIssue = (report: ISafeDelendaiReport) =>
	renderChangeText({
		kind: 'issue',
		summary: `${report.classification} ${report.packageId}${report.errorCode !== undefined ? `: ${report.errorCode}` : ''}`,
		files: [`packages/${report.packageId.replace(/^@delendai\//u, '')}/`],
		where: `\`${report.packageId}\`${report.safeToolId !== undefined ? `, tool \`${report.safeToolId}\`` : ''}`,
		evidence: issueEvidence(report),
		expected: 'The operation completes without an internal failure.',
		actual: `${report.failureClass}${report.errorCode !== undefined ? ` (${report.errorCode})` : ''}`,
	});

/** Issue title: the one template's, truncated to the plugin's bound. */
export const buildIssueTitle = (report: ISafeDelendaiReport): string =>
	truncate(renderIssue(report).title, MAX_TITLE_LENGTH);

/** Full markdown body built from the safe DTO only. */
export const buildIssueBody = (report: ISafeDelendaiReport): string =>
	`${renderIssue(report).body.trim()}\n`;

const issueEvidence = (report: ISafeDelendaiReport): string => {
	const lines: string[] = [
		'Automatic error report: this issue was opened automatically by ' +
			'`@delendai/error-reporting` after an delendai internal failure ' +
			'was reduced to a safe DTO.',
		'',
		'| Field | Value |',
		'| --- | --- |',
		`| Package | \`${report.packageId}\` |`,
		`| Reporter version | \`${report.reporterVersion}\` |`,
		`| DelendAI version | \`${report.delendaiVersion}\` |`,
		`| Classification | \`${report.classification}\` |`,
		`| Failure class | \`${report.failureClass}\` |`,
		`| Tool owner | \`${report.toolOwner}\` |`,
		`| Tool category | \`${report.toolCategory}\` |`,
		`| Fingerprint | \`${report.fingerprint}\` |`,
	];
	if (report.safeToolId !== undefined) {
		lines.push(`| Safe tool | \`${report.safeToolId}\` |`);
	}
	if (report.errorCode !== undefined) {
		lines.push(`| Error code | \`${report.errorCode}\` |`);
	}
	if (report.environmentClass !== undefined) {
		lines.push(
			`| Environment | runtime=${report.environmentClass.runtime}, platform=${report.environmentClass.platformFamily} |`,
		);
	}
	if (report.mcpFrames.length > 0) {
		lines.push(
			'',
			'### DelendAI frames',
			'',
			'```text',
			...report.mcpFrames.map((frame) => {
				const suffix =
					frame.line !== undefined
						? `:${frame.line}${frame.col !== undefined ? `:${frame.col}` : ''}`
						: '';
				return `${frame.file}${suffix}${frame.fn !== undefined ? ` ${frame.fn}` : ''}`;
			}),
			'```',
		);
	}
	if (report.syntheticExample !== undefined) {
		lines.push(
			'',
			'### Synthetic example',
			'',
			'```json',
			JSON.stringify(report.syntheticExample, null, 2),
			'```',
		);
	}
	lines.push(
		'',
		'### Safe report payload',
		'',
		'```json',
		JSON.stringify(report, null, 2),
		'```',
		'',
		'### How to enable',
		'',
		'```jsonc',
		'{ "plugins": { "error-reporting": { "options": { "enabled": true } } } }',
		'```',
	);
	return lines.join('\n').trim();
};
