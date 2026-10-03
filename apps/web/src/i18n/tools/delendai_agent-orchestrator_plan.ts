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
		en: 'Plan a task against the configured orchestration policy. Returns the chosen mode (single / linear / swarm / auto), the ordered plan steps, the budget caps, and the rotation policy. Read-only — does not dispatch subagents.',
		es: 'Planifica una tarea contra la política de orquestación configurada. Devuelve el modo elegido (single / linear / swarm / auto), los pasos ordenados del plan, los límites de presupuesto y la política de rotación. Solo lectura — no despacha subagentes.',
		fr: "Planifier une tâche selon la politique d'orchestration configurée. Renvoie le mode choisi (single / linear / swarm / auto), les étapes ordonnées du plan, les plafonds budgétaires et la politique de rotation. Lecture seule — ne dispatche pas de sous-agents.",
		de: 'Plane eine Aufgabe gemäß der konfigurierten Orchestrierungsrichtlinie. Gibt den gewählten Modus (single / linear / swarm / auto), die geordneten Planschritte, die Budgetobergrenzen und die Rotationsrichtlinie zurück. Schreibgeschützt — entsendet keine Unteragenten.',
		it: "Pianifica un'attività rispetto alla policy di orchestrazione configurata. Restituisce la modalità scelta (single / linear / swarm / auto), i passi del piano ordinati, i limiti di budget e la policy di rotazione. Sola lettura — non invia sub-agent.",
		pt: 'Planifica uma tarefa conforme a política de orquestração configurada. Devolve o modo escolhido (single / linear / swarm / auto), os passos do plano ordenados, os tetos de orçamento e a política de rotação. Apenas leitura — não despacha sub-agentes.',
		ja: '設定されたオーケーストレーションポリシーに基づいてタスクを計画します。選択されたモード (single / linear / swarm / auto)、順序付けられた計画ステップ、予算上限、回転ポリシーを返します。読み取り専用 — サブエージェントをディスパッチしません。',
		zh: '根据配置的编排策略规划任务。返回所选模式 (single / linear / swarm / auto)、有序的计划步骤、预算上限和轮换策略。只读 — 不分派子代理。',
		hi: 'कॉन्फ़िगर की गई ऑर्केस्ट्रेशन नीति के विरुद्ध कार्य की योजना बनाएं। चुना गया मोड (single / linear / swarm / auto), क्रमबद्ध योजना चरण, बजट सीमा और रोटेशन नीति लौटाता है। केवल-पढ़ने — उप-एजेंट नहीं भेजता।',
		ar: 'خطط لمهمة وفقاً لسياسة التنسيق المهيأة. يُرجع الوضع المختار (single / linear / swarm / auto)، وخطوات الخطة المرتبة، وحدود الميزانية، وسياسة التدوير. للقراءة فقط — لا يُرسل وكلاء فرعيين.',
		th: 'วางแผนงานตามนโยบายการจัดการที่ตั้งค่าไว้ คืนค่าโหมดที่เลือก (single / linear / swarm / auto) ขั้นตอนแผนที่เรียงลำดับ วงเงินงบประมาณ และนโยบายการหมุนเวียน อ่านอย่างเดียว — ไม่ส่งซับเอเจนต์',
		vi: 'Lập kế hoạch tác vụ theo chính sách điều phối đã cấu hình. Trả về chế độ đã chọn (single / linear / swarm / auto), các bước kế hoạch theo thứ tự, giới hạn ngân sách và chính sách luân chuyển. Chỉ đọc — không điều phối tác nhân phụ.',
	},
};
