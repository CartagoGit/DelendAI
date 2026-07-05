// i18n catalogue for `mcp-vertex_orchestrator-runner_cancel_invocation`.
//
// Per-tool i18n entry (apps/web/src/i18n/tools/orchestrator-runner/). The
// 12-lang invariant is enforced by `check-i18n.ts` once the entry opts in
// via `apps/web/src/i18n/tools/index.ts` (S9 wiring).

import type { IToolI18n } from '#I18N/tools/_shape';

export const orchestratorRunnerCancelInvocationI18n: IToolI18n = {
	description: {
		en: 'Cancel an in-flight invocation started by <prefix>_invoke. Applies the per-kind ladder: mcp-server sends JSON-RPC $/cancelRequest with the active id; cli sends SIGTERM then SIGKILL; api aborts the fetch (upstream spend is not refundable); subscription is best-effort. Cancelling an unknown or already-finished id returns {cancelled:false}, never an error.',
		es: 'Cancela una invocación en curso iniciada por <prefix>_invoke. Aplica la escalera por tipo: mcp-server envía JSON-RPC $/cancelRequest con el id activo; cli envía SIGTERM y luego SIGKILL; api aborta el fetch (el gasto ya realizado no es reembolsable); subscription es de mejor esfuerzo. Cancelar un id desconocido o ya finalizado devuelve {cancelled:false}, nunca un error.',
		fr: "Annule une invocation en cours démarrée par <prefix>_invoke. Applique l'échelle par type : mcp-server envoie JSON-RPC $/cancelRequest avec l'id actif ; cli envoie SIGTERM puis SIGKILL ; api interrompt le fetch (la dépense déjà engagée n'est pas remboursable) ; subscription est au mieux. Annuler un id inconnu ou déjà terminé renvoie {cancelled:false}, jamais une erreur.",
		de: 'Bricht eine laufende, von <prefix>_invoke gestartete Ausführung ab. Wendet die Leiter je Art an: mcp-server sendet JSON-RPC $/cancelRequest mit der aktiven id; cli sendet SIGTERM, dann SIGKILL; api bricht den Fetch ab (bereits entstandene Kosten sind nicht erstattbar); subscription arbeitet nach bestem Bemühen. Das Abbrechen einer unbekannten oder bereits beendeten id gibt {cancelled:false} zurück, niemals einen Fehler.',
		it: "Annulla un'invocazione in corso avviata da <prefix>_invoke. Applica la scala per tipo: mcp-server invia JSON-RPC $/cancelRequest con l'id attivo; cli invia SIGTERM poi SIGKILL; api interrompe il fetch (la spesa già effettuata non è rimborsabile); subscription è al meglio possibile. Annullare un id sconosciuto o già terminato restituisce {cancelled:false}, mai un errore.",
		pt: 'Cancela uma invocação em curso iniciada por <prefix>_invoke. Aplica a escada por tipo: mcp-server envia JSON-RPC $/cancelRequest com o id ativo; cli envia SIGTERM e depois SIGKILL; api aborta o fetch (o gasto já efetuado não é reembolsável); subscription é o melhor esforço. Cancelar um id desconhecido ou já terminado devolve {cancelled:false}, nunca um erro.',
		ja: '<prefix>_invoke で開始した実行中の呼び出しをキャンセルします。種類ごとのラダーを適用します。mcp-server はアクティブな id を付けて JSON-RPC $/cancelRequest を送信、cli は SIGTERM の後 SIGKILL を送信、api は fetch を中止(上流で発生した費用は返金されません)、subscription はベストエフォートです。未知または既に終了した id をキャンセルすると {cancelled:false} を返し、エラーにはなりません。',
		zh: '取消由 <prefix>_invoke 启动的进行中调用。应用按类型阶梯:mcp-server 带活动 id 发送 JSON-RPC $/cancelRequest;cli 先发 SIGTERM 再发 SIGKILL;api 中止 fetch(已产生的上游花费不可退款);subscription 为尽力而为。取消未知或已完成的 id 返回 {cancelled:false},绝不返回错误。',
		hi: '<prefix>_invoke द्वारा शुरू की गई चल रही किसी इनवोकेशन को रद्द करता है। प्रति-प्रकार सीढ़ी लागू करता है: mcp-server सक्रिय id के साथ JSON-RPC $/cancelRequest भेजता है; cli पहले SIGTERM फिर SIGKILL भेजता है; api fetch को रद्द करता है (ऊपरी स्तर पर हुआ खर्च वापस नहीं होता); subscription सर्वोत्तम-प्रयास है। किसी अज्ञात या पहले से समाप्त id को रद्द करने पर {cancelled:false} लौटता है, कभी त्रुटि नहीं।',
		ar: 'يُلغي استدعاءً قيد التنفيذ بدأه <prefix>_invoke. يطبّق السلّم حسب النوع: يرسل mcp-server رسالة JSON-RPC ‏$/cancelRequest بالمعرّف النشط؛ ويرسل cli إشارة SIGTERM ثم SIGKILL؛ ويُجهض api طلب الجلب (الإنفاق الذي جرى في المنبع غير قابل للاسترداد)؛ وsubscription بأفضل جهد ممكن. إلغاء معرّف غير معروف أو انتهى بالفعل يعيد {cancelled:false}، ولا يعيد خطأً أبدًا.',
		th: 'ยกเลิกการเรียกที่กำลังทำงานซึ่งเริ่มโดย <prefix>_invoke ใช้บันไดตามชนิด: mcp-server ส่ง JSON-RPC $/cancelRequest พร้อม id ที่กำลังทำงาน; cli ส่ง SIGTERM แล้วตามด้วย SIGKILL; api ยกเลิก fetch (ค่าใช้จ่ายที่เกิดขึ้นต้นทางไม่สามารถขอคืนได้); subscription เป็นแบบพยายามอย่างดีที่สุด การยกเลิก id ที่ไม่รู้จักหรือเสร็จสิ้นแล้วจะคืน {cancelled:false} ไม่เคยเป็นข้อผิดพลาด',
		vi: 'Hủy một lệnh gọi đang chạy được khởi động bởi <prefix>_invoke. Áp dụng thang theo từng loại: mcp-server gửi JSON-RPC $/cancelRequest với id đang hoạt động; cli gửi SIGTERM rồi SIGKILL; api hủy bỏ fetch (chi phí đã phát sinh ở thượng nguồn không được hoàn lại); subscription là nỗ lực tốt nhất. Hủy một id không xác định hoặc đã kết thúc trả về {cancelled:false}, không bao giờ là lỗi.',
	},
};
