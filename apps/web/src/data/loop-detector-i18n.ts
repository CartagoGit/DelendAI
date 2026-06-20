export interface ILoopDetectorPageTranslations {
	title: string;
	subtitle: string;
	overviewTitle: string;
	overviewBody1: string;
	overviewBody2: string;
	signalsTitle: string;
	signalsRepeatTitle: string;
	signalsRepeatDesc: string;
	signalsProgressTitle: string;
	signalsProgressDesc: string;
	configTitle: string;
	configDesc: string;
	handoffTitle: string;
	handoffDesc: string;
	backToPlugins: string;
}

export const loopDetectorTranslations: Record<
	string,
	ILoopDetectorPageTranslations
> = {
	en: {
		title: 'Agent Loop Detector',
		subtitle: 'In-process agent loop detection & automatic handoff',
		overviewTitle: 'Overview',
		overviewBody1:
			'The Loop Detector is an in-process system designed to prevent AI agents from getting stuck in repetitive behaviors (like executing identical tool calls multiple times) or failing to make actual progress (like announcing changes without modifications to the repository).',
		overviewBody2:
			'It is enabled by default and operates entirely on the MCP server side. If a loop or lack of progress is confirmed, the detector halts the agent, writes a detailed handoff packet to disk, and pushes a notification, allowing another agent to resume the task immediately.',
		signalsTitle: 'Active Signals',
		signalsRepeatTitle: 'Exact-Repeat Detection',
		signalsRepeatDesc:
			'Triggers when an agent calls the exact same tool with the identical arguments a consecutive number of times (default threshold: 3). Hits are computed using SHA-256 hashes of serialized arguments.',
		signalsProgressTitle: 'Git No-Progress Detection',
		signalsProgressDesc:
			"Triggers when an agent invokes file-modifying tools (like edit_file, write_file) consecutively without causing any changes in the repository's git diff status.",
		configTitle: 'Configuration',
		configDesc:
			'You can customize thresholds and behaviors at the root level of your mcp-vertex.config.json file, or override them per-session using CLI flags.',
		handoffTitle: 'Handoff Packet',
		handoffDesc:
			'When a loop is detected, a state packet is written to .mcp-vertex/handoff/<agent>-<timestamp>.json containing active locks, git status/diff summaries, and recent tool calls with redacted secrets.',
		backToPlugins: 'Back to Plugins',
	},
	es: {
		title: 'Detector de Bucles',
		subtitle:
			'Detección de bucles del agente en proceso y transferencia automática',
		overviewTitle: 'Resumen',
		overviewBody1:
			'El detector de bucles es un sistema en proceso diseñado para evitar que los agentes de IA se queden atascados en comportamientos repetitivos (como ejecutar llamadas a herramientas idénticas varias veces) o no logren realizar un progreso real.',
		overviewBody2:
			'Está activado por defecto y funciona completamente en el servidor MCP. Si se confirma un bucle, el detector detiene al agente, escribe un paquete de transferencia detallado en el disco y envía una notificación, permitiendo que otro agente reanude la tarea de inmediato.',
		signalsTitle: 'Señales Activas',
		signalsRepeatTitle: 'Detección de Repetición Exacta',
		signalsRepeatDesc:
			'Se activa cuando un agente llama a la misma herramienta con los mismos argumentos una cantidad consecutiva de veces (umbral por defecto: 3).',
		signalsProgressTitle: 'Detección de Sin Progreso en Git',
		signalsProgressDesc:
			'Se activa cuando un agente invoca herramientas que modifican archivos (como edit_file, write_file) consecutivamente sin causar ningún cambio en el diff de git.',
		configTitle: 'Configuración',
		configDesc:
			'Puedes personalizar los umbrales y comportamientos en el nivel raíz de tu archivo mcp-vertex.config.json, o sobrescribirlos por sesión usando flags de CLI.',
		handoffTitle: 'Paquete de Transferencia (Handoff)',
		handoffDesc:
			'Cuando se detecta un bucle, se escribe un paquete de estado en .mcp-vertex/handoff/<agent>-<timestamp>.json con locks activos, estado de git y llamadas a herramientas recientes con secretos redactados.',
		backToPlugins: 'Volver a Plugins',
	},
	fr: {
		title: 'Détecteur de Boucles',
		subtitle:
			"Détection de boucles d'agent en cours et transfert automatique",
		overviewTitle: 'Aperçu',
		overviewBody1:
			"Le détecteur de boucles est un système intégré conçu pour empêcher les agents d'IA de se retrouver bloqués dans des comportements répétitifs ou de ne pas faire de progrès réels.",
		overviewBody2:
			"Activé par défaut, il fonctionne côté serveur MCP. Si une boucle est confirmée, il arrête l'agent, écrit un paquet de transfert sur le disque et envoie une notification, permettant à un autre agent de reprendre immédiatement.",
		signalsTitle: 'Signaux Actifs',
		signalsRepeatTitle: 'Détection de Répétition Exacte',
		signalsRepeatDesc:
			"Se déclenche lorsqu'un agent appelle le même outil avec des arguments identiques de manière consécutive (seuil par défaut : 3).",
		signalsProgressTitle: 'Détection de Non-Progression Git',
		signalsProgressDesc:
			'Se déclenche lorsque des outils de modification de fichiers sont appelés consécutivement sans provoquer de changement dans le git diff.',
		configTitle: 'Configuration',
		configDesc:
			'Personnalisez les seuils dans mcp-vertex.config.json ou via les drapeaux CLI au démarrage.',
		handoffTitle: 'Paquet de Transfert',
		handoffDesc:
			"Un fichier d'état est écrit sous .mcp-vertex/handoff/ avec les verrous actifs, l'état git et l'historique des appels expurgé de tout secret.",
		backToPlugins: 'Retour aux Plugins',
	},
	de: {
		title: 'Schleifendetektor',
		subtitle: 'In-Process-Schleifenerkennung & automatische Übergabe',
		overviewTitle: 'Übersicht',
		overviewBody1:
			'Der Schleifendetektor verhindert, dass KI-Agenten in sich wiederholenden Verhaltensweisen stecken bleiben oder keine echten Fortschritte erzielen.',
		overviewBody2:
			'Standardmäßig aktiviert und auf der MCP-Serverseite ausgeführt. Bei einer Schleife stoppt der Detektor den Agenten, schreibt ein Übergabepaket und sendet eine Benachrichtigung.',
		signalsTitle: 'Aktive Signale',
		signalsRepeatTitle: 'Erkennung exakter Wiederholungen',
		signalsRepeatDesc:
			'Wird ausgelöst, wenn ein Agent denselben Aufruf mehrmals hintereinander mit identischen Argumenten ausführt (Standard: 3).',
		signalsProgressTitle: 'Erkennung fehlenden Git-Fortschritts',
		signalsProgressDesc:
			'Wird ausgelöst, wenn modifizierende Tools aufgerufen werden, ohne dass Änderungen im Git-Diff entstehen.',
		configTitle: 'Konfiguration',
		configDesc:
			'Passen Sie die Schwellenwerte in mcp-vertex.config.json an oder überschreiben Sie diese per CLI-Flags.',
		handoffTitle: 'Übergabepaket',
		handoffDesc:
			'Ein Zustandspaket wird unter .mcp-vertex/handoff/ gespeichert. Es enthält aktive Sperren und den bereinigten Verlauf.',
		backToPlugins: 'Zurück zu Plugins',
	},
	pt: {
		title: 'Detector de Loops',
		subtitle:
			'Detecção de loops do agente em processo e transferência automática',
		overviewTitle: 'Visão Geral',
		overviewBody1:
			'O detector de loops evita que agentes de IA fiquem presos em comportamentos repetitivos ou não consigam fazer progressos reais.',
		overviewBody2:
			'Habilitado por padrão no servidor MCP. Ao confirmar um loop, ele interrompe o agente, grava o pacote de transferência e envia uma notificação.',
		signalsTitle: 'Sinais Ativos',
		signalsRepeatTitle: 'Detecção de Repetição Exata',
		signalsRepeatDesc:
			'Disparado quando o agente chama a mesma ferramenta com argumentos idênticos consecutivamente (padrão: 3).',
		signalsProgressTitle: 'Detecção de Sem Progresso no Git',
		signalsProgressDesc:
			'Disparado ao usar ferramentas de modificação consecutivamente sem alterar o git diff.',
		configTitle: 'Configuração',
		configDesc:
			'Personalize os limites no mcp-vertex.config.json ou sobrescreva via CLI.',
		handoffTitle: 'Pacote de Transferência',
		handoffDesc:
			'Grava o estado em .mcp-vertex/handoff/ com os locks ativos e o histórico recente sem segredos.',
		backToPlugins: 'Voltar para Plugins',
	},
	it: {
		title: 'Rilevatore di Loop',
		subtitle:
			"Rilevamento di loop dell'agente in-process e passaggio automatico",
		overviewTitle: 'Panoramica',
		overviewBody1:
			'Il rilevatore di loop impedisce agli agenti IA di bloccarsi in comportamenti ripetitivi o di non fare progressi reali.',
		overviewBody2:
			"Abilitato per impostazione predefinita lato server. In caso di loop arresta l'agente, scrive un pacchetto di handoff e invia una notifica.",
		signalsTitle: 'Segnali Attivi',
		signalsRepeatTitle: 'Rilevamento Ripetizione Esatta',
		signalsRepeatDesc:
			'Si attiva quando un agente chiama lo stesso strumento con argomenti identici consecutivamente (default: 3).',
		signalsProgressTitle: 'Rilevamento Nessun Progresso Git',
		signalsProgressDesc:
			'Si attiva quando si invocano strumenti di modifica consecutivamente senza alcuna variazione nel git diff.',
		configTitle: 'Configurazione',
		configDesc:
			'Personalizza le soglie in mcp-vertex.config.json o sovrascrivi con flag CLI.',
		handoffTitle: 'Pacchetto di Handoff',
		handoffDesc:
			'Registra lo stato in .mcp-vertex/handoff/ con i lock attivi e le ultime chiamate con segreti oscurati.',
		backToPlugins: 'Torna ai Plugin',
	},
	zh: {
		title: '代理循环检测器',
		subtitle: '进程内代理循环检测与自动移交',
		overviewTitle: '概述',
		overviewBody1:
			'循环检测器旨在防止AI代理陷入重复性行为或无法取得实际进展。',
		overviewBody2:
			'默认启用，在MCP服务端运行。如果确认循环，检测器会停止代理、写入移交数据包并推送通知。',
		signalsTitle: '有效信号',
		signalsRepeatTitle: '精确重复检测',
		signalsRepeatDesc:
			'当代理连续多次调用具有相同参数的相同工具时触发（默认阈值：3）。',
		signalsProgressTitle: 'Git无进展检测',
		signalsProgressDesc:
			'当代理连续调用文件修改工具而未引起git diff状态发生任何变化时触发。',
		configTitle: '配置',
		configDesc:
			'您可以在mcp-vertex.config.json的根级别自定义阈值，或使用CLI参数进行临时覆盖。',
		handoffTitle: '移交数据包',
		handoffDesc:
			'检测到循环时，状态包将写入.mcp-vertex/handoff/目录，包含活动锁和已脱敏的历史调用。',
		backToPlugins: '返回插件列表',
	},
	hi: {
		title: 'एजेंट लूप डिटेक्टर',
		subtitle: 'इन-प्रोसेस एजेंट लूप डिटेक्शन और ऑटोमैटिक हैंडऑफ',
		overviewTitle: 'अवलोकन',
		overviewBody1:
			'लूप डिटेक्टर को एआई एजेंटों को दोहराव वाले व्यवहार में फंसने या वास्तविक प्रगति करने में विफल होने से रोकने के लिए डिज़ाइन किया गया है।',
		overviewBody2:
			'यह डिफ़ॉल्ट रूप से सक्षम है। यदि लूप की पुष्टि होती है, तो डिटेक्टर एजेंट को रोकता है, डिस्क पर हैंडऑफ पैकेट लिखता है और नोटिफिकेशन भेजता है।',
		signalsTitle: 'सक्रिय संकेत',
		signalsRepeatTitle: 'सटीक-दोहराव डिटेक्शन',
		signalsRepeatDesc:
			'तब ट्रिगर होता है जब कोई एजेंट लगातार एक ही तर्क के साथ एक ही टूल को कई बार कॉल करता है (डिफ़ॉल्ट सीमा: 3)।',
		signalsProgressTitle: 'गिट नो-प्रोग्रेस डिटेक्शन',
		signalsProgressDesc:
			'तब ट्रिगर होता है जब कोई एजेंट गिट डिफ़ॉल्ट में कोई बदलाव किए बिना लगातार फाइल-मॉडिफाइंग टूल कॉल करता है।',
		configTitle: 'कॉन्फ़िगरेशन',
		configDesc:
			'आप mcp-vertex.config.json में सीमाएं बदल सकते हैं, या CLI फ़्लैग का उपयोग करके उन्हें ओवरराइड कर सकते हैं।',
		handoffTitle: 'हैंडऑफ पैकेट',
		handoffDesc:
			'लूप का पता चलने पर, .mcp-vertex/handoff/ में स्टेट पैकेट लिखा जाता है जिसमें सक्रिय लॉक और सुरक्षित इतिहास शामिल होता है।',
		backToPlugins: 'प्लगइन्स पर वापस जाएं',
	},
	ar: {
		title: 'كاشف حلقة الوكيل',
		subtitle: 'كشف حلقة الوكيل أثناء العملية وبروتوكول التسليم التلقائي',
		overviewTitle: 'نظرة عامة',
		overviewBody1:
			'تم تصميم كاشف الحلقة لمنع وكلاء الذكاء الاصطناعي من العلوق في سلوكيات متكررة أو الفشل في إحراز تقدم حقيقي.',
		overviewBody2:
			'مُمكّن افتراضيًا ويعمل بالكامل على جانب خادم MCP. إذا تم تأكيد حلقة، يوقف الكاشف الوكيل ويكتب حزمة تسليم على القرص.',
		signalsTitle: 'الإشارات النشطة',
		signalsRepeatTitle: 'كشف التكرار الدقيق',
		signalsRepeatDesc:
			'يتم تشغيله عندما يستدعي الوكيل الأداة نفسها بمعلمات متطابقة لعدد متتالٍ من المرات (الافتراضي: 3).',
		signalsProgressTitle: 'كشف عدم إحراز تقدم في Git',
		signalsProgressDesc:
			'يتم تشغيله عند استدعاء أدوات تعديل الملفات بشكل متتالٍ دون إحداث أي تغيير في git diff.',
		configTitle: 'الإعدادات',
		configDesc:
			'يمكنك تخصيص الحدود في ملف mcp-vertex.config.json أو تجاوزها عبر وسيطات CLI.',
		handoffTitle: 'حزمة التسليم',
		handoffDesc:
			'تُكتب الحزمة في .mcp-vertex/handoff/ وتتضمن الأقفال النشطة وسجل الاستدعاءات بعد تنقيح الأسرار.',
		backToPlugins: 'العودة إلى الإضافات',
	},
	ja: {
		title: 'エージェントループ検出器',
		subtitle: 'インプロセスループ検出と自動ハンドオフプロトコル',
		overviewTitle: '概要',
		overviewBody1:
			'ループ検出器は、AIエージェントが同じツールの呼び出しを繰り返したり、実際の進捗がない状態に陥るのを防ぎます。',
		overviewBody2:
			'デフォルトで有効であり、MCPサーバー側で動作します。ループが確認されると、エージェントを停止し、ハンドオフファイルを書き出して通知を送ります。',
		signalsTitle: 'アクティブなシグナル',
		signalsRepeatTitle: '正確な繰り返しの検出',
		signalsRepeatDesc:
			'エージェントが同一の引数で同じツールを連続して呼び出した場合にトリガーされます（デフォルトの閾値：3回）。',
		signalsProgressTitle: 'Git進捗なしの検出',
		signalsProgressDesc:
			'ファイル変更ツールを連続して実行したにもかかわらず、Gitの差分（diff）に変化がない場合にトリガーされます。',
		configTitle: '設定',
		configDesc:
			'mcp-vertex.config.jsonのルートレベルで閾値をカスタマイズするか、起動時にCLIフラグで上書きできます。',
		handoffTitle: 'ハンドオフパッケージ',
		handoffDesc:
			'ループ検出時に.mcp-vertex/handoff/以下に状態ファイルが保存され、アクティブなロックとマスクされた履歴が含まれます。',
		backToPlugins: 'プラグイン一覧に戻る',
	},
	vi: {
		title: 'Trình phát hiện vòng lặp',
		subtitle:
			'Phát hiện vòng lặp tác nhân trong tiến trình & bàn giao tự động',
		overviewTitle: 'Tổng quan',
		overviewBody1:
			'Trình phát hiện vòng lặp giúp ngăn các tác nhân AI bị kẹt trong các hành vi lặp lại hoặc không thể tạo ra tiến trình thực tế.',
		overviewBody2:
			'Được bật theo mặc định và chạy trên máy chủ MCP. Nếu xác nhận vòng lặp, nó sẽ dừng tác nhân, ghi gói bàn giao và gửi thông báo.',
		signalsTitle: 'Tín hiệu hoạt động',
		signalsRepeatTitle: 'Phát hiện lặp chính xác',
		signalsRepeatDesc:
			'Kích hoạt khi tác nhân gọi cùng một công cụ với các đối số giống hệt nhau liên tiếp (mặc định: 3 lần).',
		signalsProgressTitle: 'Phát hiện không có tiến triển Git',
		signalsProgressDesc:
			'Kích hoạt khi gọi các công cụ sửa đổi tệp liên tiếp mà không gây ra bất kỳ thay đổi nào trong git diff.',
		configTitle: 'Cấu hình',
		configDesc:
			'Tùy chỉnh các ngưỡng trong mcp-vertex.config.json hoặc ghi đè thông qua các cờ CLI.',
		handoffTitle: 'Gói bàn giao',
		handoffDesc:
			'Ghi lại trạng thái trong thư mục .mcp-vertex/handoff/ chứa các khóa đang hoạt động và lịch sử đã ẩn thông tin nhạy cảm.',
		backToPlugins: 'Quay lại Plugins',
	},
	th: {
		title: 'ตัวตรวจจับลูปเอเจนต์',
		subtitle: 'การตรวจจับลูปของเอเจนต์ในกระบวนการและการส่งต่ออัตโนมัติ',
		overviewTitle: 'ภาพรวม',
		overviewBody1:
			'ตัวตรวจจับลูปช่วยป้องกันไม่ให้เอเจนต์ AI ติดอยู่ในพฤติกรรมซ้ำๆ หรือไม่สามารถสร้างความคืบหน้าจริงได้',
		overviewBody2:
			'เปิดใช้งานเป็นค่าเริ่มต้นบนเซิร์ฟเวอร์ MCP เมื่อพบการวนลูป จะหยุดเอเจนต์ เขียนแพ็กเก็ตส่งต่อ และส่งการแจ้งเตือน',
		signalsTitle: 'สัญญาณการตรวจจับ',
		signalsRepeatTitle: 'ตรวจจับการเรียกซ้ำแบบเป๊ะๆ',
		signalsRepeatDesc:
			'ทำงานเมื่อเอเจนต์เรียกใช้เครื่องมือเดียวกันด้วยอาร์กิวเมนต์เดิมซ้ำกันติดต่อกัน (ค่าเริ่มต้น: 3 ครั้ง)',
		signalsProgressTitle: 'ตรวจจับไม่มีความคืบหน้าใน Git',
		signalsProgressDesc:
			'ทำงานเมื่อมีการเรียกใช้เครื่องมือแก้ไขไฟล์ติดต่อกันแต่ไม่มีการเปลี่ยนแปลงใดๆ ใน git diff',
		configTitle: 'การตั้งค่า',
		configDesc:
			'คุณสามารถปรับแต่งค่าเกณฑ์ต่างๆ ใน mcp-vertex.config.json หรือแทนที่ผ่าน CLI flags',
		handoffTitle: 'แพ็กเก็ตส่งต่อ (Handoff)',
		handoffDesc:
			'เมื่อพบลูป แพ็กเก็ตสถานะจะถูกบันทึกไว้ที่ .mcp-vertex/handoff/ โดยจะซ่อนข้อมูลที่เป็นความลับในอาร์กิวเมนต์ล่าสุด',
		backToPlugins: 'กลับไปยังหน้าปลั๊กอิน',
	},
};
