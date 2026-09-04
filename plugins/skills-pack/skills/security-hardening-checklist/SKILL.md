---
name: security-hardening-checklist
id: security-hardening-checklist
title: Security hardening checklist
category: safety
tags: ['security', 'hardening', 'secrets', 'dependencies']
tools: ['delendai_security_security_audit', 'delendai_security_security_deps', 'delendai_security_security_sast', 'delendai_security_security_secrets', 'delendai_env_env_check']
appliesTo: ['@delendai/skills-pack', '@delendai/security', '@delendai/env']
description: Harden a project's security posture by combining audit, dependency, static analysis, secret scanning, and environment validation into one checklist.
---

# Security hardening checklist

## Goal

Raise the security floor of a project by removing obvious weaknesses and
capturing any residual risk that cannot be addressed in the current slice.

## When to use

Use this when bootstrapping a new project, preparing a release, or following
up on security-related findings from code review or operations.

## Steps

1. Run `delendai_security_security_audit` first to establish the broad risk
   surface and avoid duplicating work across narrower checks.
2. Check dependency exposure with `delendai_security_security_deps` before
   editing application code.
3. Run `delendai_security_security_sast` on the changed slice to catch unsafe
   patterns in code flow.
4. Run `delendai_security_security_secrets` on the workspace or changed files
   to catch leaked tokens, keys, and committed credentials.
5. Validate the runtime environment contract with `delendai_env_env_check` so
   missing or malformed configuration does not masquerade as application bugs.
6. Translate findings into fixes in severity order: secret exposure, vulnerable
   dependencies, unsafe code paths, then broader hardening work.

## Checks

- High-severity findings are either fixed or explicitly tracked.
- Dependency and SAST findings are connected to real code or packages, not left
  as unactioned raw output.
- Secret scanning produced zero unexplained hits.
- Environment validation matches the deployment contract for the project.

## Exit criteria

- The current slice has no unresolved critical security finding.
- Residual medium and low findings are documented with ownership.
- The hardening pass improved posture without weakening developer ergonomics by
  accident.

## References

- `delendai_security_security_audit`
- `delendai_security_security_deps`
- `delendai_security_security_sast`
- `delendai_security_security_secrets`
- `delendai_env_env_check`