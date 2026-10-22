// i18n catalogue for `delendai_external-mcps_status`.
//
// Per-tool i18n entry (f00068 S4). The 12-lang invariant is enforced by
// `check-i18n.ts` once the entry opts in via `apps/web/src/i18n/tools/index.ts`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const externalMcpsStatusI18n: IToolI18n = {
	description: {
		en: 'Report the lazy subprocess registry: one compact row per server declared under plugins.external-mcps.servers — {id, declared, running, pid?, bootedAt?, lastError?}. Declared servers boot lazily on their first call, so `running: false` is the normal cold state, not a fault. Read-only: never boots, kills or probes a child.',
		es: 'Informa del registro de subprocesos perezosos: una fila compacta por cada servidor declarado en plugins.external-mcps.servers, {id, declared, running, pid?, bootedAt?, lastError?}. Los servidores declarados arrancan de forma perezosa en su primera llamada, así que `running: false` es el estado normal en frío, no un fallo. Solo lectura: nunca arranca, mata ni sondea un proceso hijo.',
		fr: "Rapporte le registre des sous-processus paresseux : une ligne compacte par serveur déclaré sous plugins.external-mcps.servers — {id, declared, running, pid?, bootedAt?, lastError?}. Les serveurs déclarés démarrent paresseusement à leur premier appel, donc `running: false` est l'état froid normal, pas une panne. Lecture seule : ne démarre, ne tue ni ne sonde jamais un processus enfant.",
		de: 'Meldet das Register der verzögert gestarteten Unterprozesse: eine kompakte Zeile je unter plugins.external-mcps.servers deklariertem Server – {id, declared, running, pid?, bootedAt?, lastError?}. Deklarierte Server starten beim ersten Aufruf, daher ist `running: false` der normale kalte Zustand, kein Fehler. Nur lesend: startet, beendet oder prüft nie einen Kindprozess.',
		it: 'Riporta il registro dei sottoprocessi pigri: una riga compatta per ogni server dichiarato in plugins.external-mcps.servers — {id, declared, running, pid?, bootedAt?, lastError?}. I server dichiarati si avviano in modo pigro alla prima chiamata, quindi `running: false` è il normale stato a freddo, non un guasto. Sola lettura: non avvia, non termina né sonda mai un processo figlio.',
		pt: 'Indica o registo de subprocessos preguiçosos: uma linha compacta por cada servidor declarado em plugins.external-mcps.servers — {id, declared, running, pid?, bootedAt?, lastError?}. Os servidores declarados arrancam de forma preguiçosa na primeira chamada, por isso `running: false` é o estado frio normal, não uma falha. Só de leitura: nunca arranca, termina nem sonda um processo filho.',
		ja: '遅延起動するサブプロセスのレジストリを報告します。plugins.external-mcps.servers で宣言されたサーバーごとにコンパクトな 1 行 {id, declared, running, pid?, bootedAt?, lastError?} を返します。宣言済みサーバーは最初の呼び出しで遅延起動するため、`running: false` は障害ではなく通常の未起動状態です。読み取り専用で、子プロセスを起動・終了・調査することはありません。',
		zh: '报告惰性子进程注册表:plugins.external-mcps.servers 中声明的每个服务器一行紧凑记录——{id, declared, running, pid?, bootedAt?, lastError?}。已声明的服务器在首次调用时惰性启动,所以 `running: false` 是正常的冷状态,而不是故障。只读:从不启动、终止或探测子进程。',
		hi: 'आलसी ढंग से शुरू होने वाले सबप्रोसेस की रजिस्ट्री बताता है: plugins.external-mcps.servers में घोषित हर सर्वर के लिए एक संक्षिप्त पंक्ति — {id, declared, running, pid?, bootedAt?, lastError?}। घोषित सर्वर अपनी पहली कॉल पर आलसी ढंग से शुरू होते हैं, इसलिए `running: false` सामान्य ठंडी स्थिति है, कोई ख़राबी नहीं। केवल पढ़ने के लिए: कभी किसी चाइल्ड को शुरू, बंद या जाँचता नहीं।',
		ar: 'يبلغ عن سجل العمليات الفرعية الكسولة: صف مختصر لكل خادم معلَن تحت plugins.external-mcps.servers — {id, declared, running, pid?, bootedAt?, lastError?}. تبدأ الخوادم المعلنة كسولةً عند أول استدعاء لها، لذا فإن `running: false` هي الحالة الباردة الطبيعية لا عطلًا. للقراءة فقط: لا يشغّل عملية فرعية أو يوقفها أو يفحصها أبدًا.',
		th: 'รายงานทะเบียนโปรเซสย่อยแบบเริ่มเมื่อจำเป็น: หนึ่งแถวแบบย่อต่อเซิร์ฟเวอร์ที่ประกาศไว้ใต้ plugins.external-mcps.servers — {id, declared, running, pid?, bootedAt?, lastError?} เซิร์ฟเวอร์ที่ประกาศไว้จะเริ่มเมื่อถูกเรียกครั้งแรก ดังนั้น `running: false` คือสถานะเย็นตามปกติ ไม่ใช่ข้อผิดพลาด อ่านอย่างเดียว: ไม่เริ่ม ไม่ฆ่า และไม่ตรวจโปรเซสลูกเด็ดขาด',
		vi: 'Báo cáo sổ đăng ký tiến trình con khởi động lười: một hàng gọn cho mỗi máy chủ khai báo trong plugins.external-mcps.servers — {id, declared, running, pid?, bootedAt?, lastError?}. Máy chủ đã khai báo khởi động lười ở lần gọi đầu tiên, nên `running: false` là trạng thái nguội bình thường, không phải lỗi. Chỉ đọc: không bao giờ khởi động, dừng hay thăm dò một tiến trình con.',
	},
};
