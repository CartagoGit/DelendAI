// i18n catalogue for `delendai_proposals_auto_work`.
//
// Second entry of the per-tool i18n catalogue (apps/web/src/i18n/tools/).
// 12-lang invariant is enforced by `check-i18n.ts` (l100 s3-bis).

import type { IToolI18n } from '#I18N/tools/_shape';

export const proposalsAutoWorkI18n: IToolI18n = {
	description: {
		en: 'One call → what to do now. Resolves the next proposal (serial cascade) and returns a compact ordered plan (claim → slice → validate → sync → [persist] → release), or an explicit idle state. Low-token: a tight action list, not prose.',
		es: 'Una llamada → qué hacer ahora. Resuelve la siguiente propuesta (cascada en serie) y devuelve un plan ordenado y compacto (claim → slice → validate → sync → [persist] → release), o un estado inactivo explícito. Pocos tokens: una lista de acciones ajustada, no prosa.',
		fr: "Un appel → quoi faire maintenant. Résout la prochaine proposition (cascade en série) et renvoie un plan ordonné et compact (claim → slice → validate → sync → [persist] → release), ou un état d'inactivité explicite. Peu de tokens : une liste d'actions serrée, pas de prose.",
		de: 'Ein Aufruf → was jetzt zu tun ist. Ermittelt den nächsten Vorschlag (serielle Kaskade) und liefert einen kompakten, geordneten Plan (claim → slice → validate → sync → [persist] → release) oder einen ausdrücklichen Leerlaufzustand. Wenige Tokens: eine knappe Aktionsliste, keine Prosa.',
		it: 'Una chiamata → cosa fare adesso. Risolve la proposta successiva (cascata seriale) e restituisce un piano ordinato e compatto (claim → slice → validate → sync → [persist] → release), oppure uno stato di inattività esplicito. Pochi token: un elenco di azioni stringato, non prosa.',
		pt: 'Uma chamada → o que fazer agora. Resolve a próxima proposta (cascata em série) e devolve um plano ordenado e compacto (claim → slice → validate → sync → [persist] → release), ou um estado inativo explícito. Poucos tokens: uma lista de ações concisa, não prosa.',
		ja: '1 回の呼び出しで今やるべきことが分かります。次のプロポーザルを決定し(直列カスケード)、コンパクトな順序付きプラン(claim → slice → validate → sync → [persist] → release)、または明示的なアイドル状態を返します。低トークン:散文ではなく簡潔なアクション一覧です。',
		zh: '一次调用 → 现在该做什么。确定下一个提案(串行级联),返回紧凑的有序计划(claim → slice → validate → sync → [persist] → release),或明确的空闲状态。低 token:精简的操作列表,而非散文。',
		hi: 'एक कॉल → अभी क्या करना है। अगला प्रस्ताव तय करता है (क्रमिक कैस्केड) और एक संक्षिप्त क्रमबद्ध योजना (claim → slice → validate → sync → [persist] → release) या स्पष्ट निष्क्रिय स्थिति लौटाता है। कम टोकन: गद्य नहीं, कसी हुई कार्य-सूची।',
		ar: 'استدعاء واحد ← ما يجب فعله الآن. يحدد المقترح التالي (تتابع تسلسلي) ويعيد خطة مرتبة ومختصرة (claim → slice → validate → sync → [persist] → release)، أو حالة خمول صريحة. قليل الرموز: قائمة إجراءات موجزة، لا نثر.',
		th: 'เรียกครั้งเดียว → รู้ว่าต้องทำอะไรตอนนี้ หาข้อเสนอถัดไป (ลำดับแบบอนุกรม) แล้วคืนแผนแบบย่อที่เรียงลำดับไว้ (claim → slice → validate → sync → [persist] → release) หรือสถานะว่างที่ระบุชัด ใช้โทเค็นน้อย: เป็นรายการการกระทำสั้นๆ ไม่ใช่ร้อยแก้ว',
		vi: 'Một lần gọi → việc cần làm ngay. Xác định đề xuất tiếp theo (chuỗi tuần tự) và trả về một kế hoạch gọn có thứ tự (claim → slice → validate → sync → [persist] → release), hoặc trạng thái rảnh rõ ràng. Ít token: một danh sách hành động ngắn gọn, không phải văn xuôi.',
	},
};
