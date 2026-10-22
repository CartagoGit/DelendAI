# Qualified finding index

133 records:8P1,108P2,17P3. Counts retain causal overlap and dated limits; they are neither independent causes nor consensus votes. [Consensus handoff](CONSENSUS-HANDOFF.md) provides prioritization. [All original finding records](findings.json) preserve the original signed descriptions.

## Latest additions

| Key | Priority | Finding | Evidence |
|---|---|---|---|
| gpt-6.1-sol/CTX-01 | P2 | Context delta embeds the original payload in both reference fields | [record](evidence/completion-20261022/root/findings.json) |
| gpt-6.1-sol/CTX-02 | P3 | Hash-bearing reference accepts replacement content | [record](evidence/completion-20261022/root/findings.json) |
| gpt-6.1-sol/CATALOG-01 | P2 | Fresh cache ignores the changed configured source policy | [record](evidence/completion-20261022/root/findings.json) |
| gpt-6.1-sol/AGENT-INSTALL01 | P2 | Registry identity can resolve outside the installation root | [record](evidence/completion-20261022/root/findings.json) |
| gpt-6.1-sol/AGENT-INSTALL02 | P2 | Unpack failure removes the previous working installation | [record](evidence/completion-20261022/root/findings.json) |
| gpt-6.1-sol/MAINT-05 | P2 | The queue arms accepted candidates before integration certification is green | [record](evidence/completion-20261022/maintenance/findings.json) |
| gpt-6.1-sol/MAINT-06 | P2 | Incremental journal import permanently skips events published late with an older source timestamp | [record](evidence/completion-20261022/maintenance/findings.json) |
| gpt-6.1-sol/MAINT-07 | P2 | Startup generation validation depends on check response order instead of all check verdicts | [record](evidence/completion-20261022/maintenance/findings.json) |
| gpt-6.1-sol/MAINT-08 | P3 | A merged PR can mark a different checkpoint head integrated through ref-name fallback | [record](evidence/completion-20261022/maintenance/findings.json) |
| gpt-6.1-sol/MAINT-09 | P3 | GitHub integration adapter reports merged without validating the merge response body | [record](evidence/completion-20261022/maintenance/findings.json) |
| gpt-6.1-sol/UI-ROUTE01 | P2 | VS Code routes non-direct calls through the retired vertex tool name | [record](evidence/completion-20261022/extension/findings.json) |
| gpt-6.1-sol/UI-PREF01 | P2 | Dashboard theme and language controls submit stale form preferences | [record](evidence/completion-20261022/extension/findings.json) |
| gpt-6.1-sol/UI-LOG01 | P3 | The first Start realtime click sends a stop command | [record](evidence/completion-20261022/extension/findings.json) |
| gpt-6.1-sol/UI-LOG02 | P2 | Disposing a dashboard view leaves its log polling loop running | [record](evidence/completion-20261022/extension/findings.json) |
| gpt-6.1-sol/UI-I18N01 | P2 | The strict translation gate checks English-fallback dictionaries and misses 180 absent keys in ten locales | [record](evidence/completion-20261022/extension/findings.json) |
| gpt-6.1-sol/WEB-TABS01 | P2 | An old fade callback hides the tab panel that has become active again | [record](evidence/completion-20261022/web/findings.json) |
| gpt-6.1-sol/WEB-TABS02 | P2 | Tabs and copy buttons stop binding after an Astro client navigation | [record](evidence/completion-20261022/web/findings.json) |
| gpt-6.1-sol/WEB-SKILL01 | P3 | The skills index renders one literal undefined namespace heading | [record](evidence/completion-20261022/web/findings.json) |
| gpt-6.1-sol/WEB-TUTORIAL01 | P2 | Tutorial translation parity accepts equal counts with different slugs | [record](evidence/completion-20261022/web/findings.json) |
| gpt-6.1-sol/WEB-ASSET01 | P2 | A failed brand refresh deletes the existing cached logo | [record](evidence/completion-20261022/web/findings.json) |
| gpt-6.1-sol/WEB-ASSET02 | P2 | HTML gateway responses are accepted and written as SVG logos | [record](evidence/completion-20261022/web/findings.json) |
| gpt-6.1-sol/WEB-ROUTE01 | P2 | Localized home pages link to preset pages that are never emitted | [record](evidence/completion-20261022/web/findings.json) |
| gpt-6.1-sol/WEB-A11Y01 | P2 | Opening settings by keyboard leaves focus behind the modal | [record](evidence/completion-20261022/web/findings.json) |
| gpt-6.1-sol/WEB-CSS01 | P3 | The More dropdown uses a class prefix that its stylesheet never styles | [record](evidence/completion-20261022/web/findings.json) |
| gpt-6.1-sol/WEB-GATE01 | P2 | The strict web build invokes the translation checker in warn-only mode | [record](evidence/completion-20261022/web/findings.json) |

## Earlier dated records

The earlier108records remain in findings.json with qualified keys, source snapshots, scope and original descriptions. Original signed navigation is retained by reviewer-language-provenance.json; current summaries do not overwrite that evidence.

| Key | Priority | Evidence |
|---|---|---|
| gpt-6.1-sol/ORCH-01 | P1 | [record](core-cli-migrations.md#orch-01) |
| gpt-6.1-sol/ORCH-02 | P1 | [record](core-cli-migrations.md#orch-02) |
| gpt-6.1-sol/ORCH-03 | P1 | [record](core-cli-migrations.md#orch-03) |
| gpt-6.1-sol/C1 | P1 | [record](concurrency-batuta.md#c1) |
| gpt-6.1-sol/C2 | P1 | [record](concurrency-batuta.md#c2) |
| gpt-6.1-sol/NET-01 | P1 | [record](ui-security-tokens.md#net-01) |
| gpt-6.1-sol/ORCH-04 | P2 | [record](core-cli-migrations.md#orch-04) |
| gpt-6.1-sol/ORCH-05 | P2 | [record](core-cli-migrations.md#orch-05) |
| gpt-6.1-sol/C3 | P2 | [record](concurrency-batuta.md#c3) |
| gpt-6.1-sol/C4 | P2 | [record](concurrency-batuta.md#c4) |
| gpt-6.1-sol/C5 | P2 | [record](concurrency-batuta.md#c5) |
| gpt-6.1-sol/API-01 | P2 | [record](ui-security-tokens.md#api-01) |
| gpt-6.1-sol/NET-02 | P2 | [record](ui-security-tokens.md#net-02) |
| gpt-6.1-sol/UI-01 | P2 | [record](ui-security-tokens.md#ui-01) |
| gpt-6.1-sol/TOK-01 | P2 | [record](ui-security-tokens.md#tok-01) |
| gpt-6.1-sol/TOK-02 | P2 | [record](ui-security-tokens.md#tok-02) |
| gpt-6.1-sol/EXT-01 | P2 | [record](ui-security-tokens.md#ext-01) |
| gpt-6.1-sol/G61-ENV-01 | P2 | [record](independent-scanners.md#g61-env-01) |
| gpt-6.1-sol/G61-DEPS-01 | P2 | [record](independent-scanners.md#g61-deps-01) |
| gpt-6.1-sol/G61-I18N-01 | P2 | [record](independent-scanners.md#g61-i18n-01) |
| gpt-6.1-sol/G61-CONFIG-01 | P2 | [record](independent-scanners.md#g61-config-01) |
| gpt-6.1-sol/ORCH-06 | P3 | [record](core-cli-migrations.md#orch-06) |
| gpt-6.1-sol/ORCH-07 | P2 | [record](agent-orchestrator.md#orch-07) |
| gpt-6.1-sol/ORCH-08 | P2 | [record](agent-orchestrator.md#orch-08) |
| gpt-6.1-sol/ORCH-09 | P2 | [record](agent-orchestrator.md#orch-09) |
| gpt-6.1-sol/G61-STATE01 | P2 | [record](state-telemetry.md) |
| gpt-6.1-sol/G61-STATE02 | P2 | [record](state-telemetry.md) |
| gpt-6.1-sol/G61-STATE03 | P2 | [record](state-telemetry.md) |
| gpt-6.1-sol/G61-MCP01 | P2 | [record](state-telemetry.md) |
| gpt-6.1-sol/G61-STATE04 | P2 | [record](state-telemetry.md) |
| gpt-6.1-sol/G61-STATE05 | P2 | [record](state-telemetry.md) |
| gpt-6.1-sol/G61-MEM01 | P2 | [record](memory.md#g61-mem01) |
| gpt-6.1-sol/G61-MEM02 | P2 | [record](memory.md#g61-mem02) |
| gpt-6.1-sol/G61-MEM03 | P2 | [record](memory.md#g61-mem03) |
| gpt-6.1-sol/GLAB-01 | P2 | [record](plugin-integrations/fichas/gitlab.md#glab-01) |
| gpt-6.1-sol/GLAB-02 | P2 | [record](plugin-integrations/fichas/gitlab.md#glab-02) |
| gpt-6.1-sol/GLAB-03 | P2 | [record](plugin-integrations/fichas/gitlab.md#glab-03) |
| gpt-6.1-sol/API-02 | P2 | [record](ui-security-tokens.md#api-02) |
| gpt-6.1-sol/API-03 | P2 | [record](ui-security-tokens.md#api-03) |
| gpt-6.1-sol/API-04 | P2 | [record](ui-security-tokens.md#api-04) |
| gpt-6.1-sol/AUD-01 | P2 | [record](plugin-integrations/fichas/audit.md) |
| gpt-6.1-sol/AUD-02 | P2 | [record](plugin-integrations/fichas/audit.md) |
| gpt-6.1-sol/AUD-03 | P2 | [record](plugin-integrations/fichas/audit.md) |
| gpt-6.1-sol/AUD-04 | P2 | [record](plugin-integrations/fichas/audit.md) |
| gpt-6.1-sol/CP-01 | P2 | [record](plugin-integrations/fichas/commit-policy.md) |
| gpt-6.1-sol/CP-02 | P2 | [record](plugin-integrations/fichas/commit-policy.md#cp-02) |
| gpt-6.1-sol/CP-03 | P2 | [record](plugin-integrations/fichas/commit-policy.md#cp-03) |
| gpt-6.1-sol/CP-04 | P2 | [record](plugin-integrations/fichas/commit-policy.md#cp-04) |
| gpt-6.1-sol/CP-05 | P2 | [record](plugin-integrations/fichas/commit-policy.md#cp-05) |
| gpt-6.1-sol/CP-06 | P2 | [record](plugin-integrations/fichas/commit-policy.md#cp-06) |
| gpt-6.1-sol/CP-07 | P2 | [record](plugin-integrations/fichas/commit-policy.md#cp-07) |
| gpt-6.1-sol/CP-08 | P2 | [record](plugin-integrations/fichas/commit-policy.md#cp-08) |
| gpt-6.1-sol/CP-09 | P2 | [record](plugin-integrations/fichas/commit-policy.md#cp-09) |
| gpt-6.1-sol/CP-10 | P2 | [record](plugin-integrations/fichas/commit-policy.md#cp-10) |
| gpt-6.1-sol/CP-11 | P2 | [record](plugin-integrations/fichas/commit-policy.md#cp-11) |
| gpt-6.1-sol/ER-01 | P1 | [record](plugin-integrations/fichas/error-reporting.md#er-01) |
| gpt-6.1-sol/ER-02 | P2 | [record](plugin-integrations/fichas/error-reporting.md#er-02) |
| gpt-6.1-sol/ER-03 | P2 | [record](plugin-integrations/fichas/error-reporting.md#er-03) |
| gpt-6.1-sol/CP-12 | P2 | [record](evidence/completion-final-root/commit-policy-review.md) |
| gpt-6.1-sol/SEARCH-01 | P2 | [record](evidence/completion-final-root/new-findings.md) |
| gpt-6.1-sol/SEARCH-02 | P2 | [record](evidence/completion-final-root/new-findings.md) |
| gpt-6.1-sol/ISSUES-01 | P2 | [record](evidence/completion-final-root/new-findings.md) |
| gpt-6.1-sol/ROAD-01 | P2 | [record](evidence/completion-final-root/new-findings.md) |
| gpt-6.1-sol/ROAD-02 | P2 | [record](evidence/completion-final-root/new-findings.md) |
| gpt-6.1-sol/SURF-01 | P2 | [record](evidence/completion-final-root/new-findings.md) |
| gpt-6.1-sol/EXT-02 | P2 | [record](evidence/completion-external/findings.json.txt) |
| gpt-6.1-sol/EXT-03 | P2 | [record](evidence/completion-external/findings.json.txt) |
| gpt-6.1-sol/EXT-04 | P2 | [record](evidence/completion-external/findings.json.txt) |
| gpt-6.1-sol/USAGE-01 | P2 | [record](evidence/completion-usage/findings.json.txt) |
| gpt-6.1-sol/USAGE-02 | P2 | [record](evidence/completion-usage/findings.json.txt) |
| gpt-6.1-sol/USAGE-03 | P2 | [record](evidence/completion-usage/findings.json.txt) |
| gpt-6.1-sol/PROP-DOM01 | P2 | [record](evidence/completion-proposals-domain/findings.json.txt) |
| gpt-6.1-sol/PROP-PLAN02 | P2 | [record](evidence/completion-proposals-domain/findings.json.txt) |
| gpt-6.1-sol/PROP-GC01 | P2 | [record](evidence/completion-proposals-domain/findings.json.txt) |
| gpt-6.1-sol/PROP-LOG01 | P2 | [record](evidence/completion-proposals-domain/findings.json.txt) |
| gpt-6.1-sol/PROP-JOURNAL01 | P2 | [record](evidence/completion-proposals-domain/findings.json.txt) |
| gpt-6.1-sol/PROP-GC02 | P3 | [record](evidence/completion-proposals-domain/findings.json.txt) |
| gpt-6.1-sol/PROP-LINT01 | P3 | [record](evidence/completion-proposals-domain/findings.json.txt) |
| gpt-6.1-sol/G61-PROP-SVC01 | P2 | [record](evidence/completion-proposals-services/findings.json.txt) |
| gpt-6.1-sol/G61-PROP-SVC02 | P3 | [record](evidence/completion-proposals-services/findings.json.txt) |
| gpt-6.1-sol/G61-PROP-SVC03 | P2 | [record](evidence/completion-proposals-services/findings.json.txt) |
| gpt-6.1-sol/PROP-DETAIL01 | P2 | [record](evidence/completion-coord/supplemental-findings.json.txt) |
| gpt-6.1-sol/PROP-CONFIG01 | P2 | [record](evidence/completion-coord/supplemental-findings.json.txt) |
| gpt-6.1-sol/PROP-GATE01 | P2 | [record](evidence/completion-coord/supplemental-findings.json.txt) |
| gpt-6.1-sol/PROP-EVIDENCE01 | P1 | [record](evidence/completion-coord/supplemental-findings.json.txt) |
| gpt-6.1-sol/PROP-REVIEW01 | P2 | [record](evidence/completion-coord/supplemental-findings.json.txt) |
| gpt-6.1-sol/PROP-LOOP01 | P2 | [record](evidence/completion-final-root/proposals-findings.md) |
| gpt-6.1-sol/PROP-ROUND01 | P2 | [record](evidence/completion-proposals-swarm/findings.json.txt) |
| gpt-6.1-sol/PROP-ROUND02 | P3 | [record](evidence/completion-proposals-swarm/findings.json.txt) |
| gpt-6.1-sol/CLI-OFFER01 | P3 | [record](evidence/completion-20261021/payment-stop-finding.md) |
| gpt-6.1-sol/ACCOUNT-01 | P2 | [record](evidence/continuation-20261021/root/findings.md) |
| gpt-6.1-sol/ACCOUNT-02 | P2 | [record](evidence/continuation-20261021/root/findings.md) |
| gpt-6.1-sol/RECLAIM-01 | P2 | [record](evidence/continuation-20261021/root/findings.md) |
| gpt-6.1-sol/RECLAIM-02 | P2 | [record](evidence/continuation-20261021/root/findings.md) |
| gpt-6.1-sol/ACCOUNT-03 | P2 | [record](evidence/continuation-20261021/root/findings.md) |
| gpt-6.1-sol/SKILL-01 | P2 | [record](evidence/continuation-20261021/skills/report.md) |
| gpt-6.1-sol/SKILL-02 | P2 | [record](evidence/continuation-20261021/skills/report.md) |
| gpt-6.1-sol/SKILL-03 | P3 | [record](evidence/continuation-20261021/skills/report.md) |
| gpt-6.1-sol/SKILL-04 | P3 | [record](evidence/continuation-20261021/skills/report.md) |
| gpt-6.1-sol/SKILL-05 | P3 | [record](evidence/continuation-20261021/skills/report.md) |
| gpt-6.1-sol/SKILL-06 | P3 | [record](evidence/continuation-20261021/skills/report.md) |
| gpt-6.1-sol/MAINT-01 | P2 | [record](evidence/continuation-20261021/maintenance/report.md) |
| gpt-6.1-sol/MAINT-02 | P2 | [record](evidence/continuation-20261021/maintenance/report.md) |
| gpt-6.1-sol/MAINT-03 | P2 | [record](evidence/continuation-20261021/maintenance/report.md) |
| gpt-6.1-sol/MAINT-04 | P3 | [record](evidence/continuation-20261021/maintenance/report.md) |
| gpt-6.1-sol/UI-CFG01 | P2 | [record](evidence/continuation-20261021/ui-critical/report.md) |
| gpt-6.1-sol/UI-CFG02 | P2 | [record](evidence/continuation-20261021/ui-critical/report.md) |
| gpt-6.1-sol/UI-ACTION01 | P2 | [record](evidence/continuation-20261021/ui-critical/report.md) |
