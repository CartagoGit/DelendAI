/**
 * check-budgets.ts — compare measured file sizes against per-file and total
 * byte budgets and report violations as normalized findings. Pure; no budget
 * means no finding on that axis (the sizes are still reported by the tool).
 */
import type { IFinding } from '@delendai/core/public';

import type {
	IFileSize,
	IPerfBudgets,
} from '../contracts/interfaces/perf.interface';

/** Human-readable byte size (e.g. `12.3 KB`). Pure. */
export const formatBytes = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	return `${(kb / 1024).toFixed(2)} MB`;
};

/** Sum the byte sizes of the matched files. Pure. */
export const totalBytes = (files: readonly IFileSize[]): number =>
	files.reduce((sum, file) => sum + file.bytes, 0);

/**
 * Check file sizes against budgets → findings, most severe first is left to
 * the caller (`sortFindings`). A file over `maxFileBytes` is `file-over-budget`
 * (high when >2× the budget, else medium); the total over `maxTotalBytes` is
 * `total-over-budget` (high). Pure; deterministic (files sorted by path).
 */
export const checkBudgets = (
	files: readonly IFileSize[],
	budgets: IPerfBudgets,
): IFinding[] => {
	const findings: IFinding[] = [];
	const { maxFileBytes, maxTotalBytes } = budgets;

	if (maxFileBytes !== undefined) {
		const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
		for (const file of sorted) {
			if (file.bytes <= maxFileBytes) continue;
			findings.push({
				ruleId: 'file-over-budget',
				severity: file.bytes > maxFileBytes * 2 ? 'high' : 'medium',
				message: `${file.path} is ${formatBytes(file.bytes)} — over the ${formatBytes(maxFileBytes)} per-file budget`,
				location: { file: file.path },
				fix: 'Split, tree-shake, or code-split this file to bring it under budget.',
			});
		}
	}

	if (maxTotalBytes !== undefined) {
		const total = totalBytes(files);
		if (total > maxTotalBytes) {
			findings.push({
				ruleId: 'total-over-budget',
				severity: 'high',
				message: `total is ${formatBytes(total)} across ${files.length} file(s) — over the ${formatBytes(maxTotalBytes)} budget`,
				fix: 'Reduce the largest files, or raise the budget deliberately.',
			});
		}
	}

	return findings;
};
