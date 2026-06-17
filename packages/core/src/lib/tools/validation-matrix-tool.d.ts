import type { IValidationMatrix } from '../contracts/interfaces/validation-matrix.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
/**
 * Returns the project's quality-gate commands per scope so an agent
 * knows exactly how to validate its work here — without guessing
 * `bun run ...` / `npm test`. Sourced from `mcp-core.config.json`
 * (`validationMatrix`). Empty `scopes` means none configured.
 */
export declare const buildValidationMatrixToolRegistration: (namespacePrefix: string, matrix: () => IValidationMatrix) => IToolRegistration;
