/**
 * in-flight-reports.service.ts — a report is finished before the plugin is.
 *
 * The hooks that observe a failure fire their report and return at once,
 * so a slow report never delays the tool call it is about. That made
 * every report an orphan: nothing waited for it, including the plugin's
 * disposal. A report still writing its dedupe state after the host had
 * disposed the plugin and deleted the workspace failed CI with
 * `ENOTEMPTY: directory not empty, rmdir '…/.cache/delendai/error-reporting'`
 * — the delete lost a race with a write nobody was tracking.
 *
 * The hooks still do not wait. The plugin's `dispose` does: it settles
 * every report still in flight, whatever each one's outcome.
 */
import type { IInFlightReports } from './contracts/interfaces/in-flight-reports.interface';

export const createInFlightReports = (): IInFlightReports => {
	const pending = new Set<Promise<unknown>>();
	return {
		track: (report) => {
			const settled = report.then(
				() => undefined,
				() => undefined,
			);
			pending.add(settled);
			void settled.then(() => pending.delete(settled));
		},
		settle: async () => {
			while (pending.size > 0) {
				await Promise.all([...pending]);
			}
		},
	};
};
