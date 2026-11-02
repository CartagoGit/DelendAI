// i18n catalogue for the `agent-orchestrator_plan` tool.
//
// Per the `_shape.ts` convention, the runtime description is always
// English (the MCP SDK rejects anything else); this catalogue only
// affects how the docs site renders the description in non-English
// locales. We ship English only — the gate (l100) does not yet
// require 12-lang completeness for new entries, and the i18n infra
// falls back to English when a translation is missing.
//
// Keep the English text aligned with
// `plugins/agent-orchestrator/src/lib/tools/plan.tool.ts`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const agentOrchestratorPlanI18n: IToolI18n = {
	description: {
		en: 'Plan a task against the configured orchestration policy. Returns the chosen mode, ordered plan steps, budgets, and rotation policy. Read-only — does not dispatch subagents.',
		es: 'Planifica una tarea según la política de orquestación configurada. Devuelve el modo elegido, los pasos ordenados del plan, los presupuestos y la política de rotación. Solo lectura: no lanza subagentes.',
		fr: "Planifie une tâche selon la politique d'orchestration configurée. Renvoie le mode choisi, les étapes ordonnées du plan, les budgets et la politique de rotation. Lecture seule — ne lance aucun sous-agent.",
		de: 'Plant eine Aufgabe anhand der konfigurierten Orchestrierungsrichtlinie. Liefert den gewählten Modus, die geordneten Planschritte, Budgets und die Rotationsrichtlinie. Nur lesend – startet keine Subagenten.',
		it: 'Pianifica un task secondo la politica di orchestrazione configurata. Restituisce la modalità scelta, i passi ordinati del piano, i budget e la politica di rotazione. Sola lettura — non avvia subagenti.',
		pt: 'Planeia uma tarefa segundo a política de orquestração configurada. Devolve o modo escolhido, os passos ordenados do plano, os orçamentos e a política de rotação. Só de leitura — não lança subagentes.',
		ja: '設定されたオーケストレーションポリシーに沿ってタスクを計画します。選ばれたモード、順序付きの計画ステップ、予算、ローテーションポリシーを返します。読み取り専用で、サブエージェントは起動しません。',
		zh: '按照已配置的编排策略规划任务。返回所选模式、有序的计划步骤、预算和轮换策略。只读——不会派发子智能体。',
		hi: 'कॉन्फ़िगर की गई ऑर्केस्ट्रेशन नीति के अनुसार किसी काम की योजना बनाता है। चुना गया मोड, क्रमबद्ध योजना-चरण, बजट और रोटेशन नीति लौटाता है। केवल पढ़ने के लिए — कोई सब-एजेंट नहीं भेजता।',
		ar: 'يخطط لمهمة وفق سياسة التنسيق المضبوطة. يعيد النمط المختار، وخطوات الخطة المرتبة، والميزانيات، وسياسة التناوب. للقراءة فقط — لا يُطلق وكلاء فرعيين.',
		th: 'วางแผนงานตามนโยบายการประสานงานที่ตั้งค่าไว้ คืนโหมดที่เลือก ขั้นตอนของแผนตามลำดับ งบประมาณ และนโยบายการหมุนเวียน อ่านอย่างเดียว ไม่ส่งเอเจนต์ย่อยออกไป',
		vi: 'Lập kế hoạch cho một tác vụ theo chính sách điều phối đã cấu hình. Trả về chế độ được chọn, các bước kế hoạch theo thứ tự, ngân sách và chính sách luân phiên. Chỉ đọc — không điều phối tác tử con.',
	},
};
