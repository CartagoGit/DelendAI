/**
 * plan-closure.ts (barrel)
 *
 * Back-compat re-export of the post-SOLID-refactor plan-closure
 * modules. The implementation is split across four cohesive files:
 *
 *   - `./plan-closure.types.ts`      — data shapes (SRP)
 *   - `./plan-closure.strategy.ts`  — `IPlanChildrenResolver` interface
 *                                     + the `withOwnSlices` decorator
 *                                     (DIP + ISP)
 *   - `./plan-closure.engine.ts`    — pure `evaluatePlanClosure` (OCP)
 *   - `./plan-closure.resolvers.ts` — in-memory + disk resolver builders
 *                                     (SRP)
 *
 * Existing imports (`from '../swarm/plan-closure'`) keep working
 * unchanged. New code should import from the specific module it needs
 * to make the dependency graph legible.
 */

export type {
	IPlanChildKind,
	IPlanChildSnapshot,
	IPlanClosureGatePolicy,
	IPlanClosureReason,
	IPlanClosureReasonCode,
	IPlanClosureReport,
} from './plan-closure.types';
export {
	DEFAULT_CLOSURE_GATE_POLICY,
	policyFromFrontmatter,
} from './plan-closure.types';

export type { IPlanChildrenResolver } from './plan-closure.strategy';
export { withOwnSlices } from './plan-closure.strategy';

export type { IEvaluatePlanClosureOptions } from './plan-closure.engine';
export {
	DEFAULT_MAX_DEPTH,
	evaluatePlanClosure,
} from './plan-closure.engine';

export type {
	IDiskPlanResolverOptions,
	IInMemoryResolverInput,
} from './plan-closure.resolvers';
export {
	buildDiskPlanChildrenResolver,
	buildInMemoryResolver,
	readOwnSliceStatusesFromDisk,
	readPlanOwnSliceStatuses,
} from './plan-closure.resolvers';
