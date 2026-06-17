import { z } from 'zod';
import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IScaffoldedFile } from './scaffold-host';
export interface IScaffoldToolOptions {
    readonly namespacePrefix: string;
    readonly workspace: IWorkspacePathProvider;
    readonly projectName: string;
    readonly serverPackageName: string;
    readonly defaultModel?: string;
}
export declare const SCAFFOLD_INPUT_SCHEMA: z.ZodObject<{
    kind: z.ZodEnum<{
        host: "host";
        plugin: "plugin";
        client: "client";
        tool: "tool";
        prompt: "prompt";
        skill: "skill";
        agent: "agent";
    }>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    slot: z.ZodOptional<z.ZodEnum<{
        proposal_guardian: "proposal_guardian";
        implementation_runner: "implementation_runner";
        delivery_verifier: "delivery_verifier";
        technical_investigator: "technical_investigator";
        orchestrator: "orchestrator";
    }>>;
    dryRun: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type IScaffoldArgs = z.infer<typeof SCAFFOLD_INPUT_SCHEMA>;
export interface IScaffoldReport {
    readonly kind: IScaffoldArgs['kind'];
    readonly dryRun: boolean;
    readonly files: readonly IScaffoldedFile[];
    readonly written: readonly string[];
    readonly skipped: readonly string[];
    readonly errors: readonly string[];
}
export declare const buildScaffoldReport: (options: IScaffoldToolOptions, args: IScaffoldArgs) => IScaffoldReport;
/** Registration for the host's `<prefix>_scaffold` tool. */
export declare const buildScaffoldToolRegistration: (options: IScaffoldToolOptions) => IToolRegistration;
