/**
 * Join a base path with a child segment, collapsing a trailing slash on
 * the base. Workspace-relative join used across the core and plugins
 * (single source of truth; previously duplicated per package).
 */
export declare const joinRel: (base: string, child: string) => string;
