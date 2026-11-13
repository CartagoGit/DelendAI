// i18n catalogue for `delendai_usage-tracking_usage_clear`.
//
// Per-tool i18n entry (apps/web/src/i18n/tools/usage-tracking/). 12-lang
// invariant is enforced by `check-i18n.ts` once the entry opts in via
// `apps/web/src/i18n/tools/index.ts`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const usageTrackingUsageClearI18n: IToolI18n = {
	description: {
		en: 'Clear the recorded usage history: truncates invocations.jsonl and usage-summary.json under the cache dir. Destructive and irreversible — you must pass confirm:true. Intended as an explicit user action, not something an agent does on its own.',
		es: 'Borra el historial de uso registrado: vacía invocations.jsonl y usage-summary.json en el directorio de caché. Destructivo e irreversible: debes pasar confirm:true. Pensado como una acción explícita del usuario, no como algo que un agente haga por su cuenta.',
		fr: "Efface l'historique d'usage enregistré : tronque invocations.jsonl et usage-summary.json dans le dossier de cache. Destructif et irréversible — vous devez passer confirm:true. Prévu comme une action explicite de l'utilisateur, pas comme quelque chose qu'un agent fait de lui-même.",
		de: 'Löscht den erfassten Nutzungsverlauf: kürzt invocations.jsonl und usage-summary.json im Cache-Verzeichnis. Destruktiv und unumkehrbar – du musst confirm:true übergeben. Gedacht als ausdrückliche Aktion der Person, nicht als etwas, das ein Agent von sich aus tut.',
		it: "Cancella la cronologia di utilizzo registrata: svuota invocations.jsonl e usage-summary.json nella cartella di cache. Distruttivo e irreversibile — devi passare confirm:true. Pensato come azione esplicita dell'utente, non come qualcosa che un agente fa da solo.",
		pt: 'Apaga o histórico de uso registado: esvazia invocations.jsonl e usage-summary.json na pasta de cache. Destrutivo e irreversível — tem de passar confirm:true. Pensado como uma ação explícita do utilizador, não algo que um agente faça por iniciativa própria.',
		ja: '記録された利用履歴を消去します。キャッシュディレクトリ配下の invocations.jsonl と usage-summary.json を空にします。破壊的で元に戻せないため、confirm:true を渡す必要があります。エージェントが自分から行うものではなく、ユーザーの明示的な操作として想定されています。',
		zh: '清除已记录的使用历史:清空缓存目录下的 invocations.jsonl 和 usage-summary.json。具有破坏性且不可逆——必须传入 confirm:true。设计为用户的明确操作,而不是智能体自行决定做的事。',
		hi: 'दर्ज उपयोग इतिहास मिटाता है: कैश निर्देशिका में invocations.jsonl और usage-summary.json को ख़ाली करता है। विनाशकारी और अपरिवर्तनीय — आपको confirm:true देना होगा। यह उपयोगकर्ता की स्पष्ट कार्रवाई के रूप में है, ऐसा कुछ नहीं जो एजेंट अपने आप करे।',
		ar: 'يمسح سجل الاستخدام المسجّل: يفرّغ invocations.jsonl وusage-summary.json تحت دليل الذاكرة المؤقتة. مدمّر ولا رجعة فيه — يجب أن تمرّر confirm:true. مخصّص ليكون إجراءً صريحًا من المستخدم، لا شيئًا يفعله وكيل من تلقاء نفسه.',
		th: 'ล้างประวัติการใช้งานที่บันทึกไว้: ตัด invocations.jsonl และ usage-summary.json ในไดเรกทอรีแคชให้ว่าง ทำลายข้อมูลและย้อนกลับไม่ได้ ต้องส่ง confirm:true มีไว้เป็นการกระทำที่ผู้ใช้สั่งชัดเจน ไม่ใช่สิ่งที่เอเจนต์ทำเอง',
		vi: 'Xóa lịch sử sử dụng đã ghi: làm rỗng invocations.jsonl và usage-summary.json trong thư mục bộ nhớ đệm. Mang tính phá hủy và không thể hoàn tác — bạn phải truyền confirm:true. Dành cho thao tác rõ ràng của người dùng, không phải việc một tác tử tự làm.',
	},
};
