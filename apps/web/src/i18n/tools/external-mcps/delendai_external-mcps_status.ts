// i18n catalogue for `delendai_external-mcps_status`.
//
// Per-tool i18n entry (f00068 S4). The 12-lang invariant is enforced by
// `check-i18n.ts` once the entry opts in via `apps/web/src/i18n/tools/index.ts`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const externalMcpsStatusI18n: IToolI18n = {
	description: {
		en: 'Report the lazy subprocess registry state for every declared external server: whether it is declared only or already booted, its pid, and its last boot error if any. Read-only — it never boots or stops a server, so a status call is always safe. Use it to decide whether the first ext.<server>.<tool> call will pay the cold-boot cost.',
		es: 'Informa del estado del registro de subprocesos perezosos para cada servidor externo declarado: si solo está declarado o ya arrancado, su pid y su último error de arranque si lo hay. Solo lectura: nunca arranca ni detiene un servidor, así que una llamada de estado siempre es segura. Úsalo para decidir si la primera llamada ext.<server>.<tool> pagará el coste de arranque en frío.',
		fr: 'Rapporte l’état du registre de sous-processus paresseux pour chaque serveur externe déclaré : s’il est seulement déclaré ou déjà démarré, son pid et sa dernière erreur de démarrage le cas échéant. Lecture seule — il ne démarre ni n’arrête jamais un serveur, donc un appel de statut est toujours sûr. Utilisez-le pour décider si le premier appel ext.<server>.<tool> paiera le coût du démarrage à froid.',
		de: 'Meldet den Zustand der Lazy-Subprozess-Registry für jeden deklarierten externen Server: ob er nur deklariert oder bereits gestartet ist, seine PID und seinen letzten Startfehler, falls vorhanden. Nur lesend — er startet oder stoppt nie einen Server, daher ist ein Statusaufruf immer sicher. Nutze ihn, um zu entscheiden, ob der erste ext.<server>.<tool>-Aufruf die Kaltstartkosten zahlt.',
		it: 'Riporta lo stato del registro dei sottoprocessi lazy per ogni server esterno dichiarato: se è solo dichiarato o già avviato, il suo pid e il suo ultimo errore di avvio, se presente. Sola lettura — non avvia né arresta mai un server, quindi una chiamata di stato è sempre sicura. Usalo per decidere se la prima chiamata ext.<server>.<tool> pagherà il costo di avvio a freddo.',
		pt: 'Reporta o estado do registo de subprocessos preguiçosos para cada servidor externo declarado: se está apenas declarado ou já arrancado, o seu pid e o seu último erro de arranque, se houver. Só de leitura — nunca arranca nem para um servidor, por isso uma chamada de estado é sempre segura. Use-o para decidir se a primeira chamada ext.<server>.<tool> pagará o custo de arranque a frio.',
		ja: '宣言済みの各外部サーバーについて、遅延サブプロセスレジストリの状態を報告します:宣言のみか既に起動済みか、その pid、直近の起動エラー(あれば)。読み取り専用——サーバーを起動も停止もしないため、status 呼び出しは常に安全です。最初の ext.<server>.<tool> 呼び出しがコールドブートのコストを払うかどうかの判断に使います。',
		zh: '报告每个已声明外部服务器的惰性子进程注册表状态:它是仅已声明还是已启动、其 pid,以及最近一次启动错误(如有)。只读——它绝不会启动或停止服务器,因此状态调用始终安全。用它来判断首次 ext.<server>.<tool> 调用是否会付出冷启动成本。',
		hi: 'प्रत्येक घोषित बाहरी सर्वर के लिए आलसी उप-प्रक्रिया रजिस्ट्री की स्थिति बताता है: वह केवल घोषित है या पहले से बूट, उसका pid, और उसकी पिछली बूट त्रुटि यदि कोई हो। केवल पढ़ने के लिए — यह कभी सर्वर बूट या बंद नहीं करता, इसलिए स्थिति कॉल हमेशा सुरक्षित है। इसका उपयोग यह तय करने के लिए करें कि पहली ext.<server>.<tool> कॉल कोल्ड-बूट की लागत चुकाएगी या नहीं।',
		ar: 'يبلّغ عن حالة سجلّ العمليات الفرعية الكسول لكل خادم خارجي معلَن: هل هو معلَن فقط أم مُشغَّل بالفعل، ومعرّف عمليته (pid)، وآخر خطأ إقلاع إن وُجد. للقراءة فقط — لا يُشغّل خادمًا ولا يوقفه أبدًا، لذا فاستدعاء الحالة آمن دائمًا. استخدمه لتقرّر ما إذا كان أول استدعاء ext.<server>.<tool> سيتحمّل تكلفة الإقلاع البارد.',
		th: 'รายงานสถานะรีจิสทรีของกระบวนการย่อยแบบ lazy สำหรับเซิร์ฟเวอร์ภายนอกที่ประกาศไว้ทุกตัว: ประกาศไว้เฉยๆ หรือบูตแล้ว, pid ของมัน และข้อผิดพลาดการบูตครั้งล่าสุดถ้ามี อ่านอย่างเดียว — ไม่เคยบูตหรือหยุดเซิร์ฟเวอร์ ดังนั้นการเรียกสถานะจึงปลอดภัยเสมอ ใช้เพื่อตัดสินว่าการเรียก ext.<server>.<tool> ครั้งแรกจะต้องจ่ายต้นทุนการบูตเย็นหรือไม่',
		vi: 'Báo cáo trạng thái sổ đăng ký tiến trình con lười cho mọi máy chủ ngoài đã khai báo: chỉ mới khai báo hay đã khởi động, pid của nó, và lỗi khởi động gần nhất nếu có. Chỉ đọc — nó không bao giờ khởi động hay dừng máy chủ, nên gọi trạng thái luôn an toàn. Dùng nó để quyết định xem lệnh ext.<server>.<tool> đầu tiên có phải trả chi phí khởi động nguội hay không.',
	},
};
