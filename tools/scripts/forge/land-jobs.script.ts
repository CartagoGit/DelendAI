#!/usr/bin/env bun
/**
 * land-jobs.script.ts — this repository's `development.integration.commands.jobs`:
 * prints the test zones a change from `<base>` to `<head>` can reach, one per
 * line, or `*` when that cannot be bounded. A zone a change only feeds counts
 * as reached: the integrator groups on overlap, so over-reporting is safe.
 */
import { gitDiffChanges } from '../ci/affected.script';
import { zoneReach } from '../ci/test-zones.script';

/** The lines to print for the change `base...head` in `rootDir`. */
export const jobsLines = (
	rootDir: string,
	base: string,
	head: string,
): readonly string[] => {
	if (gitDiffChanges(base, head, rootDir).length === 0) return [];
	const reach = zoneReach({ base, head, rootDir });
	return reach === undefined
		? ['*']
		: [...new Set([...reach.zones, ...reach.readOnly])];
};

if (import.meta.main) {
	const [base, head] = process.argv.slice(2);
	if (base === undefined || head === undefined) {
		console.error('usage: land-jobs.script.ts <base> <head>');
		process.exit(2);
	}
	for (const line of jobsLines(process.cwd(), base, head)) console.log(line);
}
