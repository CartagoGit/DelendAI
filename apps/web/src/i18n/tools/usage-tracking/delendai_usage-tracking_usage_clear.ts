// i18n catalogue for `delendai_usage-tracking_usage_clear`.
//
// Per-tool i18n entry (apps/web/src/i18n/tools/usage-tracking/). 12-lang
// invariant is enforced by `check-i18n.ts` once the entry opts in via
// `apps/web/src/i18n/tools/index.ts`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const usageTrackingUsageClearI18n: IToolI18n = {
	description: {
		en: 'Clear the recorded usage history: truncates the invocations log and usage summary under the cache dir. Destructive and irreversible — you must pass confirm:true. Intended as an explicit user action, not something an agent does on its own.',
		es: 'Borra el historial de uso registrado: vacía el registro de invocaciones y el resumen de uso en el directorio de caché. Destructivo e irreversible: debes pasar confirm:true. Pensado como una acción explícita del usuario, no algo que un agente haga por su cuenta.',
		fr: "Efface l'historique d'utilisation enregistré : vide le journal des invocations et le récapitulatif d'utilisation dans le répertoire de cache. Destructif et irréversible — vous devez passer confirm:true. Conçu comme une action explicite de l'utilisateur, pas quelque chose qu'un agent fait de lui-même.",
		de: 'Löscht die aufgezeichnete Nutzungshistorie: leert das Aufrufprotokoll und die Nutzungszusammenfassung im Cache-Verzeichnis. Destruktiv und unumkehrbar — du musst confirm:true übergeben. Als ausdrückliche Benutzeraktion gedacht, nicht als etwas, das ein Agent von sich aus tut.',
		it: "Cancella la cronologia di utilizzo registrata: svuota il log delle invocazioni e il riepilogo di utilizzo nella cartella cache. Distruttivo e irreversibile — devi passare confirm:true. Pensato come azione esplicita dell'utente, non qualcosa che un agente fa da solo.",
		pt: 'Limpa o histórico de uso registado: esvazia o registo de invocações e o resumo de uso no diretório de cache. Destrutivo e irreversível — tens de passar confirm:true. Destinado a ser uma ação explícita do utilizador, não algo que um agente faça por conta própria.',
		ja: '記録された使用履歴を消去します。キャッシュディレクトリ内の呼び出しログと使用量サマリーを切り詰めます。破壊的で元に戻せません。confirm:true を渡す必要があります。エージェントが独断で行うものではなく、ユーザーの明示的な操作を想定しています。',
		zh: '清除已记录的使用历史:截断缓存目录中的调用日志和使用摘要。具有破坏性且不可逆——必须传入 confirm:true。这应是用户的明确操作,而非代理自行执行的操作。',
		hi: 'दर्ज उपयोग इतिहास साफ़ करता है: कैश निर्देशिका में इनवोकेशन लॉग और उपयोग सारांश को खाली करता है। विनाशकारी और अपरिवर्तनीय — आपको confirm:true पास करना होगा। यह उपयोगकर्ता की स्पष्ट कार्रवाई के रूप में है, न कि कुछ जो कोई एजेंट स्वयं करे।',
		ar: 'يمسح سجل الاستخدام المُسجَّل: يقتطع سجل الاستدعاءات وملخص الاستخدام داخل مجلد الذاكرة المؤقتة. إجراء مدمّر لا رجعة فيه — يجب تمرير confirm:true. مُخصَّص كإجراء صريح من المستخدم، وليس شيئًا يقوم به الوكيل من تلقاء نفسه.',
		th: 'ล้างประวัติการใช้งานที่บันทึกไว้: ตัดบันทึกการเรียกใช้และสรุปการใช้งานในไดเรกทอรีแคช เป็นการทำลายและย้อนกลับไม่ได้ — คุณต้องส่ง confirm:true มีเจตนาให้เป็นการกระทำที่ผู้ใช้สั่งอย่างชัดเจน ไม่ใช่สิ่งที่เอเจนต์ทำเอง',
		vi: 'Xóa lịch sử sử dụng đã ghi: cắt bỏ nhật ký lệnh gọi và bản tóm tắt sử dụng trong thư mục bộ nhớ đệm. Có tính hủy hoại và không thể hoàn tác — bạn phải truyền confirm:true. Được dự định là hành động rõ ràng của người dùng, không phải điều mà tác nhân tự thực hiện.',
	},
};
