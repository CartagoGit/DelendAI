---
id: q00035
title: "The joint audit a00095 is settled: every finding is fixed, merged into another, or rejected with its reason"
kind: plan
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
contains:
  audits:
    - a00095
  proposals:
    - x00939
    - x00940
    - x00942
    - x00943
    - x00944
    - r00644
    - x00945
    - x00946
    - x00947
    - x00948
    - x00949
    - x00950
    - v00138
    - x00951
    - x00952
    - x00953
    - x00955
    - x00966
    - c00535
    - f00791
    - x00967
    - x00970
    - x00962
    - x00973
    - x00974
    - x00960
    - x00965
    - x00972
    - x00975
    - f00790
    - x00977
    - x00979
    - x00980
    - x00981
    - x00982
    - c00533
    - x00978
    - x00971
    - x00958
    - r00645
    - c00534
    - d00417
    - x00963
    - x00976
    - x00964
    - f00788
    - f00789
    - x00959
closureGate:
  requirePeerReview: true
  requireAllSlicesDone: true
  requireAllChildrenDone: true
---

# q00035 — The joint audit a00095 is settled: every finding is fixed, merged into another, or rejected with its reason

## goal

Every finding of the joint audit a00095, and every record of gpt-6.1-sol's contribution to it, is settled by a child proposal of this plan, by a proposal that already fixed it, as a duplicate of another finding, or rejected with its reason; the plan closes, and closes a00095 with it, when every settling proposal is done.

## why

a00095 is the multi-LLM joint audit of develop: 286 findings (145 G, 124 D, 14 C, 3 S headings) from twelve reviewers, plus 133 records in gpt-6.1-sol's contribution (docs/delendai/audit-reports/a00095/2026-10-19-gpt-6.1-sol/findings.jsonl), whose CONSENSUS-HANDOFF of 2026-10-22 recommends starting the causal union. The owner asked for a plan of dozens of proposals covering every finding, fix, improvement and refactor so the project becomes consistent. The 419 records were grouped by cause into 48 child proposals; the Ledger below settles each a00095 finding (the audit-ledger lint checks it), and each child's Why names the sol records it carries. While implementing x00939 the dishonest-outputSchema family (D4, D10, D18, D19, G71) was measured not to be a runtime defect since 48880ea1a, so those rows are rejected with the measurement and x00941 is retired.

## non-goals

- Rewriting a00095 or the reviewers' reports: they stay as published.
- Settling the sol records in this ledger: the ledger names a00095's own headings; the sol records are carried by the children's Why.

## slices

- global_gate: type

### S1 — Every child is done and the ledger is settled
- **Status**: pending
- **Files**: `docs/delendai/proposals/ready/plans/q00035-the-joint-audit-a00095-is-settled-every-finding-is-fixed-merged-into-another-or-rejected-with-its-reason.md`
- **Gate**: none
- acceptance:
  - "proposals_close_plan reports no blocker: every contained proposal is done and every ledger row's settling proposal is done."
  - "Closing the plan moves a00095 to done."

## acceptance

- proposals_close_plan reports no blocker: every contained proposal is done and every ledger row's settling proposal is done.
- Closing the plan moves a00095 to done.

## Ledger

| Finding | Settlement |
|---|---|
| a00095/S1 | rejected: a slice heading of the audit, not a finding |
| a00095/S10 | rejected: a slice heading of the audit, not a finding |
| a00095/S11 | rejected: a slice heading of the audit, not a finding |
| a00095/G1 | settled-by: r00645 |
| a00095/G2 | settled-by: r00644 |
| a00095/G3 | settled-by: r00644 |
| a00095/G4 | settled-by: x00977 |
| a00095/G5 | settled-by: x00946 |
| a00095/G6 | settled-by: c00534 |
| a00095/G7 | settled-by: c00534 |
| a00095/G8 | settled-by: x00979 |
| a00095/G9 | settled-by: c00533 |
| a00095/G10 | settled-by: c00534 |
| a00095/G11 | settled-by: x00966 |
| a00095/G12 | settled-by: v00138 |
| a00095/G13 | settled-by: c00534 |
| a00095/G14 | settled-by: r00645 |
| a00095/G15 | rejected: a positive observation (atomic writes hold in the coarse stores); its exceptions are D1-D3 |
| a00095/G16 | rejected: a positive observation (no eval, insecure http or hardcoded secrets in the sweep) |
| a00095/G17 | rejected: a positive observation (extension deactivate drains its disposables); UI-LOG02 qualifies it |
| a00095/G18 | settled-by: r00644 |
| a00095/D1 | settled-by: x00942 |
| a00095/D2 | settled-by: x00942 |
| a00095/D3 | settled-by: x00942 |
| a00095/D4 | rejected: not a runtime defect since 48880ea1a: the host drops an error structuredContent the schema rejects and the error travels as text (measured in x00939; x00941 retired) |
| a00095/D5 | settled-by: x00944 |
| a00095/D6 | settled-by: x00943 |
| a00095/D7 | settled-by: x00945 |
| a00095/D8 | settled-by: r00645 |
| a00095/D9 | settled-by: c00534 |
| a00095/D10 | rejected: not a runtime defect since 48880ea1a: the host drops an error structuredContent the schema rejects and the error travels as text (measured in x00939; x00941 retired) |
| a00095/D11 | settled-by: x00979 |
| a00095/D12 | settled-by: x00980 |
| a00095/D13 | settled-by: x00950 |
| a00095/D14 | settled-by: d00417 |
| a00095/D15 | settled-by: r00644 |
| a00095/D16 | rejected: a positive observation of the second pass |
| a00095/G19 | settled-by: x00909 |
| a00095/G20 | settled-by: x00909 |
| a00095/G21 | settled-by: f00790 |
| a00095/G22 | settled-by: x00979 |
| a00095/G23 | settled-by: x00981 |
| a00095/G24 | settled-by: c00534 |
| a00095/G25 | settled-by: x00953 |
| a00095/G26 | settled-by: x00950 |
| a00095/G27 | settled-by: x00971 |
| a00095/G28 | settled-by: x00909 |
| a00095/G29 | settled-by: f00551 |
| a00095/D17 | settled-by: x00966 |
| a00095/G30 | settled-by: f00790 |
| a00095/G31 | settled-by: x00955 |
| a00095/G32 | settled-by: f00790 |
| a00095/G33 | settled-by: x00944 |
| a00095/G34 | settled-by: x00921 |
| a00095/G35 | settled-by: x00920 |
| a00095/G36 | settled-by: x00918, x00919 |
| a00095/G37 | settled-by: x00917 |
| a00095/G38 | settled-by: x00945 |
| a00095/G39 | settled-by: c00534 |
| a00095/G40 | settled-by: x00950 |
| a00095/G41 | settled-by: x00955 |
| a00095/G42 | settled-by: x00966 |
| a00095/G43 | settled-by: r00644 |
| a00095/G44 | settled-by: f00788 |
| a00095/G45 | settled-by: c00535 |
| a00095/G46 | settled-by: c00533 |
| a00095/G47 | settled-by: x00981 |
| a00095/G48 | settled-by: x00963 |
| a00095/G49 | settled-by: x00963 |
| a00095/G50 | settled-by: x00980 |
| a00095/G51 | settled-by: x00942 |
| a00095/G52 | settled-by: f00790 |
| a00095/G53 | settled-by: f00790 |
| a00095/G54 | settled-by: x00953 |
| a00095/G55 | settled-by: x00981 |
| a00095/G56 | settled-by: f00790 |
| a00095/G59 | settled-by: c00534 |
| a00095/G60 | settled-by: c00534 |
| a00095/G61 | settled-by: x00950 |
| a00095/G62 | settled-by: x00970 |
| a00095/G63 | settled-by: x00948 |
| a00095/G64 | settled-by: f00788 |
| a00095/G65 | settled-by: x00971 |
| a00095/G66 | settled-by: x00971 |
| a00095/G67 | settled-by: r00644 |
| a00095/D18 | rejected: not a runtime defect since 48880ea1a: the host drops an error structuredContent the schema rejects and the error travels as text (measured in x00939; x00941 retired) |
| a00095/D19 | rejected: not a runtime defect since 48880ea1a: the host drops an error structuredContent the schema rejects and the error travels as text (measured in x00939; x00941 retired) |
| a00095/D20 | settled-by: x00939 |
| a00095/D21 | settled-by: x00958 |
| a00095/D22 | settled-by: x00952 |
| a00095/D23 | settled-by: x00951 |
| a00095/D24 | settled-by: x00978 |
| a00095/D25 | settled-by: x00978 |
| a00095/D26 | settled-by: x00947 |
| a00095/D27 | settled-by: x00981 |
| a00095/D28 | settled-by: x00947 |
| a00095/D29 | settled-by: x00981 |
| a00095/D30 | settled-by: f00790 |
| a00095/D31 | settled-by: x00945 |
| a00095/D32 | settled-by: x00945 |
| a00095/D33 | settled-by: x00980 |
| a00095/D34 | settled-by: x00947 |
| a00095/D35 | settled-by: d00417 |
| a00095/D36 | settled-by: x00977 |
| a00095/D37 | settled-by: d00417 |
| a00095/D38 | same-as: a00095/G60 |
| a00095/D39 | settled-by: x00971 |
| a00095/D40 | settled-by: x00951 |
| a00095/D41 | settled-by: x00940 |
| a00095/D42 | settled-by: x00962 |
| a00095/D43 | settled-by: x00974 |
| a00095/D44 | settled-by: x00952 |
| a00095/D45 | settled-by: x00966 |
| a00095/D46 | settled-by: x00965 |
| a00095/D47 | settled-by: x00965 |
| a00095/D48 | settled-by: x00970 |
| a00095/D49 | settled-by: x00973 |
| a00095/D50 | settled-by: x00963 |
| a00095/D51 | settled-by: x00972 |
| a00095/D52 | settled-by: x00975 |
| a00095/D53 | settled-by: x00975 |
| a00095/D54 | settled-by: x00951 |
| a00095/D55 | settled-by: x00975 |
| a00095/D56 | settled-by: x00965 |
| a00095/D57 | settled-by: x00974 |
| a00095/D58 | settled-by: x00974 |
| a00095/D59 | settled-by: x00975 |
| a00095/D60 | settled-by: x00973 |
| a00095/D61 | settled-by: x00972 |
| a00095/D62 | settled-by: f00791 |
| a00095/D120 | settled-by: x00973 |
| a00095/D121 | settled-by: x00951 |
| a00095/D122 | settled-by: x00972 |
| a00095/D123 | settled-by: x00953 |
| a00095/D124 | rejected: a positive observation (test-policy schema, mutex and redaction are the pattern to follow) |
| a00095/D119 | settled-by: x00973 |
| a00095/D118 | settled-by: x00973 |
| a00095/D117 | settled-by: x00973 |
| a00095/D116 | settled-by: x00973 |
| a00095/D115 | settled-by: x00962 |
| a00095/D112 | settled-by: x00955 |
| a00095/D113 | settled-by: x00972 |
| a00095/D114 | settled-by: x00972 |
| a00095/D111 | settled-by: x00962 |
| a00095/D109 | settled-by: x00973 |
| a00095/D110 | settled-by: x00967 |
| a00095/D107 | settled-by: x00973 |
| a00095/D108 | settled-by: x00973 |
| a00095/D105 | settled-by: x00973 |
| a00095/D106 | settled-by: x00975 |
| a00095/D103 | settled-by: x00974 |
| a00095/D104 | settled-by: x00962 |
| a00095/D101 | settled-by: x00972 |
| a00095/D102 | settled-by: x00952 |
| a00095/D99 | same-as: a00095/D103 |
| a00095/D100 | settled-by: x00975 |
| a00095/D97 | settled-by: x00974 |
| a00095/D98 | settled-by: x00974 |
| a00095/D95 | settled-by: x00953 |
| a00095/D96 | settled-by: x00975 |
| a00095/D93 | settled-by: x00974 |
| a00095/D94 | settled-by: x00970 |
| a00095/D91 | settled-by: x00965 |
| a00095/D92 | settled-by: x00962 |
| a00095/D89 | settled-by: x00974 |
| a00095/D90 | settled-by: x00970 |
| a00095/D87 | settled-by: x00967 |
| a00095/D88 | settled-by: x00965 |
| a00095/D85 | settled-by: x00973 |
| a00095/D86 | settled-by: x00974 |
| a00095/D83 | settled-by: x00970 |
| a00095/D84 | settled-by: x00972 |
| a00095/D81 | settled-by: x00960 |
| a00095/D82 | settled-by: x00970 |
| a00095/D79 | settled-by: x00955 |
| a00095/D80 | settled-by: x00974 |
| a00095/D77 | same-as: a00095/D108 |
| a00095/D78 | settled-by: x00973 |
| a00095/D75 | same-as: a00095/D83 |
| a00095/D76 | same-as: a00095/D84 |
| a00095/D70 | settled-by: x00962 |
| a00095/D71 | settled-by: x00960 |
| a00095/D72 | settled-by: x00973 |
| a00095/D73 | same-as: a00095/D82 |
| a00095/D74 | settled-by: x00972 |
| a00095/D67 | settled-by: x00952 |
| a00095/D68 | settled-by: x00967 |
| a00095/D69 | settled-by: x00967 |
| a00095/D63 | settled-by: x00974 |
| a00095/D64 | settled-by: x00974 |
| a00095/D65 | same-as: a00095/D79 |
| a00095/D66 | same-as: a00095/D80 |
| a00095/G68 | settled-by: x00971 |
| a00095/G69 | settled-by: x00942 |
| a00095/G70 | settled-by: x00981 |
| a00095/G71 | rejected: not a runtime defect since 48880ea1a: the host drops an error structuredContent the schema rejects and the error travels as text (measured in x00939; x00941 retired) |
| a00095/G72 | settled-by: c00533 |
| a00095/G73 | settled-by: c00534 |
| a00095/G74 | settled-by: f00789 |
| a00095/G75 | settled-by: f00789 |
| a00095/G76 | settled-by: f00789 |
| a00095/G77 | settled-by: f00789 |
| a00095/G78 | settled-by: f00789 |
| a00095/G79 | settled-by: x00958 |
| a00095/G80 | settled-by: x00958 |
| a00095/G81 | settled-by: x00958 |
| a00095/G82 | settled-by: x00958 |
| a00095/G83 | settled-by: x00949 |
| a00095/G84 | settled-by: x00958 |
| a00095/G85 | settled-by: x00974 |
| a00095/G86 | settled-by: v00138 |
| a00095/G91 | settled-by: x00942 |
| a00095/G92 | settled-by: x00942 |
| a00095/G93 | settled-by: x00945 |
| a00095/G94 | settled-by: x00977 |
| a00095/G95 | settled-by: x00977 |
| a00095/G96 | settled-by: x00977 |
| a00095/G97 | settled-by: x00958 |
| a00095/G98 | settled-by: x00958 |
| a00095/G99 | settled-by: f00790 |
| a00095/G100 | settled-by: f00788 |
| a00095/G87 | settled-by: f00788 |
| a00095/G88 | settled-by: f00788 |
| a00095/G89 | settled-by: f00788 |
| a00095/G90 | settled-by: f00788 |
| a00095/G101 | settled-by: f00791 |
| a00095/G150 | settled-by: f00789 |
| a00095/G151 | settled-by: x00947 |
| a00095/G152 | settled-by: f00788 |
| a00095/C1 | settled-by: f00788 |
| a00095/C2 | settled-by: f00789 |
| a00095/C3 | settled-by: x00926 |
| a00095/C4 | settled-by: x00959 |
| a00095/C5 | settled-by: x00959 |
| a00095/C6 | settled-by: f00788 |
| a00095/C7 | settled-by: x00947 |
| a00095/C8 | rejected: a positive observation: what worked in coordination |
| a00095/C9 | settled-by: x00959 |
| a00095/C10 | settled-by: x00959 |
| a00095/C11 | settled-by: x00959 |
| a00095/C12 | settled-by: x00947 |
| a00095/C13 | settled-by: x00959 |
| a00095/C14 | rejected: a positive observation: what worked with subagents |
| a00095/G102 | settled-by: x00951 |
| a00095/G103 | settled-by: x00951 |
| a00095/G104 | settled-by: x00951 |
| a00095/G105 | settled-by: x00939 |
| a00095/G106 | settled-by: c00534 |
| a00095/G107 | settled-by: x00953 |
| a00095/G108 | settled-by: x00952 |
| a00095/G109 | settled-by: x00939 |
| a00095/G110 | settled-by: x00939 |
| a00095/G111 | settled-by: x00976 |
| a00095/G112 | settled-by: x00976 |
| a00095/G113 | settled-by: x00971 |
| a00095/G153 | settled-by: x00950 |
| a00095/G154 | settled-by: x00950 |
| a00095/G155 | settled-by: x00950 |
| a00095/G156 | settled-by: x00950 |
| a00095/G157 | settled-by: x00950 |
| a00095/G158 | settled-by: x00948 |
| a00095/G159 | settled-by: f00787 |
| a00095/G114 | settled-by: x00953 |
| a00095/G115 | settled-by: x00953 |
| a00095/G116 | settled-by: x00953 |
| a00095/G117 | settled-by: x00955 |
| a00095/G118 | settled-by: x00965 |
| a00095/G119 | settled-by: x00955 |
| a00095/G120 | settled-by: x00953 |
| a00095/G121 | settled-by: f00791 |
| a00095/G122 | settled-by: f00791 |
| a00095/G123 | settled-by: f00790 |
| a00095/G124 | settled-by: x00971 |
| a00095/G125 | settled-by: x00958 |
| a00095/G126 | settled-by: x00958 |
| a00095/G127 | settled-by: x00946 |
| a00095/G128 | settled-by: x00946 |
| a00095/G129 | settled-by: x00946 |
| a00095/G130 | settled-by: c00535 |
| a00095/G131 | settled-by: x00953 |
| a00095/G132 | settled-by: f00790 |
| a00095/G133 | settled-by: x00977 |
| a00095/G134 | settled-by: x00979 |
| a00095/G135 | settled-by: x00979 |
| a00095/G136 | settled-by: x00980 |
| a00095/G137 | settled-by: x00980 |
