---
id: commit-policy
package: @delendai/commit-policy
version: 0.3.0
maturity: experimental
generated: 2026-11-03T01:24:49.458Z
---

# Commit Policy

> Auto-generated. Do not edit. Regenerate with bun run generate:from-manifests.

## Summary

Commit-authority plugin: configurable identity, cadence and audit-trail policy wrapping the git plugin primitives. Off by default — opt in via plugins.commit-policy.options.

## Tags

- commit
- policy
- git
- agent
- f00181

## Presets

- team-pr
- swarm
- everything
- dogfood

## Permissions

- filesystem-read
- filesystem-write
- process
- network
- git-read
- git-write
- env-read

## Dependencies

- @delendai/core
- @modelcontextprotocol/sdk
- zod

## Capabilities

- commit-policy
