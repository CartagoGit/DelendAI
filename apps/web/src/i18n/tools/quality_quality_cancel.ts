// i18n catalogue for `quality_quality_cancel`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const qualityQualityCancelI18n: IToolI18n = {
	description: {
		en: 'Abort quality commands currently running in this server. With `pid`, cancels only that one; otherwise cancels every in-flight run (SIGKILL on the whole process group). Returns the cancelled PIDs. Use when a run_quality scope is taking too long.',
		es: 'Aborta los comandos de calidad que se están ejecutando actualmente en este servidor. Con `pid`, cancela solo ese; en caso contrario, cancela todas las ejecuciones en curso (SIGKILL en todo el grupo de procesos). Devuelve los PIDs cancelados. Úsalo cuando un scope de run_quality esté tardando demasiado.',
		fr: "Interrompt les commandes de qualité en cours d'exécution sur ce serveur. Avec `pid`, annule seulement celle-ci ; sinon, annule chaque exécution en cours (SIGKILL sur tout le groupe de processus). Renvoie les PID annulés. À utiliser quand un scope de run_quality prend trop de temps.",
		de: 'Bricht aktuell auf diesem Server laufende Qualitätsbefehle ab. Mit `pid` wird nur dieser eine abgebrochen; ansonsten werden alle laufenden Ausführungen abgebrochen (SIGKILL für die gesamte Prozessgruppe). Gibt die abgebrochenen PIDs zurück. Verwenden, wenn ein run_quality-Scope zu lange dauert.',
		it: 'Interrompe i comandi di qualità attualmente in esecuzione su questo server. Con `pid`, annulla solo quello; altrimenti annulla ogni esecuzione in corso (SIGKILL sull intero gruppo di processi). Restituisce i PID annullati. Usalo quando uno scope di run_quality richiede troppo tempo.',
		pt: 'Aborta os comandos de qualidade atualmente em execução neste servidor. Com `pid`, cancela apenas esse; caso contrário, cancela todas as execuções em curso (SIGKILL em todo o grupo de processos). Devolve os PIDs cancelados. Usar quando um scope de run_quality está a demorar demasiado.',
		ja: 'このサーバーで現在実行中の品質コマンドを中止します。`pid` を指定すると、それのみを取り消します。指定しない場合は実行中のすべてを取り消します(プロセスグループ全体に SIGKILL)。取り消された PID を返します。run_quality のスコープが時間がかかり過ぎている場合に使用します。',
		zh: '中止当前在此服务器上运行的质量命令。带 `pid` 时仅取消该进程;否则取消所有正在进行的运行(对整个进程组发送 SIGKILL)。返回被取消的 PID。当 run_quality 范围耗时过长时使用。',
		hi: 'इस सर्वर में अभी चल रहे क्वालिटी कमांड्स को निरस्त करता है। `pid` के साथ, केवल उसी को कैंसल करता है; अन्यथा हर इन-फ़्लाइट रन को कैंसल करता है (पूरे प्रोसेस ग्रुप पर SIGKILL)। रद्द किए गए PIDs लौटाता है। जब run_quality scope बहुत समय ले रहा हो तो उपयोग करें।',
		ar: 'يُلغي أوامر الجودة الجارية حاليًا في هذا الخادم. باستخدام `pid`، يُلغي ذلك الأمر فقط؛ وإلا يُلغي كل تشغيل جارٍ (SIGKILL على مجموعة العمليات بالكامل). يُرجع معرفات العمليات (PIDs) المُلغاة. استخدمه عندما يستغرق نطاق run_quality وقتًا طويلاً جدًا.',
		th: 'ยกเลิกคำสั่งคุณภาพที่กำลังรันอยู่ในเซิร์ฟเวอร์นี้ ด้วย `pid` จะยกเลิกเฉพาะตัวนั้น ไม่เช่นนั้นจะยกเลิกทุกการรันที่กำลังดำเนินอยู่ (SIGKILL ทั้งกลุ่มโปรเซส) ส่งคืน PID ที่ถูกยกเลิก ใช้เมื่อ scope ของ run_quality ใช้เวลานานเกินไป',
		vi: 'Hủy các lệnh quality đang chạy trên máy chủ này. Với `pid`, chỉ hủy lệnh đó; nếu không sẽ hủy mọi lần chạy đang diễn ra (SIGKILL toàn bộ nhóm tiến trình). Trả về các PID đã hủy. Dùng khi một scope của run_quality mất quá nhiều thời gian.',
	},
};
