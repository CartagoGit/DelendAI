// i18n catalogue for `mcp-vertex_notification_notify_status`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const notificationNotifyStatusI18n: IToolI18n = {
	description: {
		en: 'Report the lock-release notifier: the watched lock file, how many lock-released notifications it has pushed, and the most recent releases. The notifier emits notifications/message {event:"lock-released",taskId,agent,files} so agents react to freed files instead of polling agent_lock.',
		es: 'Informa sobre el notificador de liberación de locks: el fichero de lock vigilado, cuántas notificaciones de liberación ha enviado y las liberaciones más recientes. El notificador emite notifications/message {event:"lock-released",taskId,agent,files} para que los agentes reaccionen a los ficheros liberados en lugar de hacer polling de agent_lock.',
		fr: 'Rapporte le notificateur de libération de verrou : le fichier de verrou surveillé, le nombre de notifications de libération envoyées et les libérations les plus récentes. Le notificateur émet notifications/message {event:"lock-released",taskId,agent,files} afin que les agents réagissent aux fichiers libérés au lieu de faire du polling sur agent_lock.',
		de: 'Berichtet über den Lock-Release-Notifier: die überwachte Lock-Datei, wie viele lock-released-Benachrichtigungen er gesendet hat, und die jüngsten Freigaben. Der Notifier sendet notifications/message {event:"lock-released",taskId,agent,files}, damit Agenten auf freigegebene Dateien reagieren, statt agent_lock per Polling abzufragen.',
		it: 'Riporta il notificatore di rilascio dei lock: il file di lock osservato, quante notifiche di rilascio ha inviato e i rilasci più recenti. Il notificatore emette notifications/message {event:"lock-released",taskId,agent,files} così gli agenti reagiscono ai file liberati invece di fare polling su agent_lock.',
		pt: 'Reporta o notificador de libertação de locks: o ficheiro de lock vigiado, quantas notificações de libertação enviou e as libertações mais recentes. O notificador emite notifications/message {event:"lock-released",taskId,agent,files} para que os agentes reajam aos ficheiros libertados em vez de fazer polling a agent_lock.',
		ja: 'ロック解放通知者を報告します:監視中のロックファイル、これまでに送信した lock-released 通知の数、直近の解放。通知者は notifications/message {event:"lock-released",taskId,agent,files} を発行し、エージェントが agent_lock をポーリングする代わりに解放されたファイルに反応できるようにします。',
		zh: '报告锁释放通知器:被监视的锁文件、它已推送的锁释放通知数量,以及最近的释放记录。通知器会发出 notifications/message {event:"lock-released",taskId,agent,files},使代理对释放的文件做出反应,而不必轮询 agent_lock。',
		hi: 'लॉक-रिलीज़ नोटिफायर की रिपोर्ट करता है: देखी जा रही लॉक फ़ाइल, इसने कितनी लॉक-रिलीज़ नोटिफिकेशन भेजी हैं, और सबसे हाल की रिलीज़। नोटिफायर notifications/message {event:"lock-released",taskId,agent,files} उत्सर्जित करता है ताकि एजेंट agent_lock को पोल करने के बजाय मुक्त की गई फ़ाइलों पर प्रतिक्रिया दें।',
		ar: 'يُبلغ عن مُنبّه تحرير القفل: ملف القفل المُراقَب، وعدد إشعارات تحرير القفل التي أرسلها، وأحدث التحريرات. يُصدر المُنبّه notifications/message {event:"lock-released",taskId,agent,files} حتى يستجيب الوكلاء للملفات المُحررة بدلاً من استطلاع agent_lock.',
		th: 'รายงานตัวแจ้งเตือนการปลดล็อก: ไฟล์ล็อกที่ถูกเฝ้าดู จำนวนการแจ้งเตือนการปลดล็อกที่ส่งไปแล้ว และการปลดล็อกล่าสุด ตัวแจ้งเตือนจะส่ง notifications/message {event:"lock-released",taskId,agent,files} เพื่อให้เอเจนต์ตอบสนองต่อไฟล์ที่ถูกปลดล็อกแทนการ poll agent_lock',
		vi: 'Báo cáo về bộ thông báo giải phóng lock: tệp lock đang được theo dõi, số lượng thông báo lock-released đã đẩy đi, và các lần giải phóng gần đây nhất. Bộ thông báo phát ra notifications/message {event:"lock-released",taskId,agent,files} để các agent phản ứng với các tệp đã được giải phóng thay vì poll agent_lock.',
	},
};
