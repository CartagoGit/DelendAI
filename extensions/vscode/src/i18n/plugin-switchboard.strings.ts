/** Typed 12-language copy for the plugin activation switchboard (f00107 S3). */
import type { Lang } from './index';
import type { IPluginSwitchboardStrings } from '../contracts/interfaces/plugin-switchboard-strings.interface';

const en: IPluginSwitchboardStrings = {
	pick: 'Select a plugin or external server',
	ours: 'ours',
	yours: 'yours',
	external: 'external',
	enabled: 'on',
	disabled: 'off',
	enable: 'Enable',
	disable: 'Disable',
	savedRestart: 'Activation saved. Restart the MCP server to apply it.',
	restart: 'Restart server',
	noWorkspace: 'Open a workspace before changing plugin activation.',
	unavailable:
		'Activation introspection is unavailable; restart with a compatible core version.',
};
const es: IPluginSwitchboardStrings = {
	pick: 'Selecciona un plugin o servidor externo',
	ours: 'nuestro',
	yours: 'tuyo',
	external: 'externo',
	enabled: 'activo',
	disabled: 'inactivo',
	enable: 'Activar',
	disable: 'Desactivar',
	savedRestart:
		'Activación guardada. Reinicia el servidor MCP para aplicarla.',
	restart: 'Reiniciar servidor',
	noWorkspace: 'Abre un espacio de trabajo antes de cambiar la activación.',
	unavailable:
		'La introspección de activación no está disponible; reinicia con una versión compatible del core.',
};
const fr: IPluginSwitchboardStrings = {
	pick: 'Sélectionnez un plugin ou serveur externe',
	ours: 'nôtre',
	yours: 'vôtre',
	external: 'externe',
	enabled: 'actif',
	disabled: 'inactif',
	enable: 'Activer',
	disable: 'Désactiver',
	savedRestart:
		'Activation enregistrée. Redémarrez le serveur MCP pour l’appliquer.',
	restart: 'Redémarrer le serveur',
	noWorkspace: 'Ouvrez un espace de travail avant de modifier l’activation.',
	unavailable:
		'L’introspection d’activation est indisponible ; redémarrez avec une version compatible du cœur.',
};
const de: IPluginSwitchboardStrings = {
	pick: 'Plugin oder externen Server auswählen',
	ours: 'unser',
	yours: 'Ihr',
	external: 'extern',
	enabled: 'an',
	disabled: 'aus',
	enable: 'Aktivieren',
	disable: 'Deaktivieren',
	savedRestart: 'Aktivierung gespeichert. Starten Sie den MCP-Server neu.',
	restart: 'Server neu starten',
	noWorkspace:
		'Öffnen Sie einen Arbeitsbereich, bevor Sie die Aktivierung ändern.',
	unavailable:
		'Aktivierungsdaten sind nicht verfügbar; starten Sie mit einer kompatiblen Core-Version neu.',
};
const it: IPluginSwitchboardStrings = {
	pick: 'Seleziona un plugin o server esterno',
	ours: 'nostro',
	yours: 'tuo',
	external: 'esterno',
	enabled: 'attivo',
	disabled: 'inattivo',
	enable: 'Attiva',
	disable: 'Disattiva',
	savedRestart: 'Attivazione salvata. Riavvia il server MCP per applicarla.',
	restart: 'Riavvia server',
	noWorkspace: 'Apri uno spazio di lavoro prima di cambiare l’attivazione.',
	unavailable:
		'Introspezione dell’attivazione non disponibile; riavvia con una versione core compatibile.',
};
const pt: IPluginSwitchboardStrings = {
	pick: 'Selecione um plugin ou servidor externo',
	ours: 'nosso',
	yours: 'seu',
	external: 'externo',
	enabled: 'ativo',
	disabled: 'inativo',
	enable: 'Ativar',
	disable: 'Desativar',
	savedRestart: 'Ativação salva. Reinicie o servidor MCP para aplicá-la.',
	restart: 'Reiniciar servidor',
	noWorkspace: 'Abra um espaço de trabalho antes de alterar a ativação.',
	unavailable:
		'A introspecção de ativação não está disponível; reinicie com uma versão compatível do core.',
};
const ja: IPluginSwitchboardStrings = {
	pick: 'プラグインまたは外部サーバーを選択',
	ours: '公式',
	yours: 'ユーザー',
	external: '外部',
	enabled: 'オン',
	disabled: 'オフ',
	enable: '有効化',
	disable: '無効化',
	savedRestart:
		'設定を保存しました。適用するには MCP サーバーを再起動してください。',
	restart: 'サーバーを再起動',
	noWorkspace: '有効状態を変更する前にワークスペースを開いてください。',
	unavailable:
		'有効状態の情報を取得できません。互換性のある core で再起動してください。',
};
const zh: IPluginSwitchboardStrings = {
	pick: '选择插件或外部服务器',
	ours: '官方',
	yours: '你的',
	external: '外部',
	enabled: '开启',
	disabled: '关闭',
	enable: '启用',
	disable: '禁用',
	savedRestart: '激活设置已保存。请重启 MCP 服务器以应用。',
	restart: '重启服务器',
	noWorkspace: '更改插件激活状态前请先打开工作区。',
	unavailable: '激活信息不可用；请使用兼容的核心版本重启。',
};
const hi: IPluginSwitchboardStrings = {
	pick: 'प्लगइन या बाहरी सर्वर चुनें',
	ours: 'हमारा',
	yours: 'आपका',
	external: 'बाहरी',
	enabled: 'चालू',
	disabled: 'बंद',
	enable: 'सक्रिय करें',
	disable: 'निष्क्रिय करें',
	savedRestart: 'सक्रियण सहेजा गया। लागू करने के लिए MCP सर्वर पुनः आरंभ करें।',
	restart: 'सर्वर पुनः आरंभ करें',
	noWorkspace: 'सक्रियण बदलने से पहले कार्यक्षेत्र खोलें।',
	unavailable: 'सक्रियण जानकारी उपलब्ध नहीं है; संगत core संस्करण से पुनः आरंभ करें।',
};
const ar: IPluginSwitchboardStrings = {
	pick: 'اختر إضافة أو خادمًا خارجيًا',
	ours: 'خاصتنا',
	yours: 'خاصتك',
	external: 'خارجي',
	enabled: 'مفعّل',
	disabled: 'معطّل',
	enable: 'تفعيل',
	disable: 'تعطيل',
	savedRestart: 'تم حفظ التفعيل. أعد تشغيل خادم MCP لتطبيقه.',
	restart: 'إعادة تشغيل الخادم',
	noWorkspace: 'افتح مساحة عمل قبل تغيير التفعيل.',
	unavailable: 'معلومات التفعيل غير متاحة؛ أعد التشغيل بإصدار core متوافق.',
};
const th: IPluginSwitchboardStrings = {
	pick: 'เลือกปลั๊กอินหรือเซิร์ฟเวอร์ภายนอก',
	ours: 'ของเรา',
	yours: 'ของคุณ',
	external: 'ภายนอก',
	enabled: 'เปิด',
	disabled: 'ปิด',
	enable: 'เปิดใช้งาน',
	disable: 'ปิดใช้งาน',
	savedRestart: 'บันทึกการเปิดใช้งานแล้ว รีสตาร์ตเซิร์ฟเวอร์ MCP เพื่อใช้ค่า',
	restart: 'รีสตาร์ตเซิร์ฟเวอร์',
	noWorkspace: 'เปิดเวิร์กสเปซก่อนเปลี่ยนการเปิดใช้งาน',
	unavailable: 'ไม่มีข้อมูลการเปิดใช้งาน โปรดรีสตาร์ตด้วย core รุ่นที่รองรับ',
};
const vi: IPluginSwitchboardStrings = {
	pick: 'Chọn plugin hoặc máy chủ bên ngoài',
	ours: 'của chúng tôi',
	yours: 'của bạn',
	external: 'bên ngoài',
	enabled: 'bật',
	disabled: 'tắt',
	enable: 'Bật',
	disable: 'Tắt',
	savedRestart: 'Đã lưu kích hoạt. Khởi động lại máy chủ MCP để áp dụng.',
	restart: 'Khởi động lại máy chủ',
	noWorkspace: 'Mở workspace trước khi thay đổi kích hoạt.',
	unavailable:
		'Không có dữ liệu kích hoạt; hãy khởi động lại bằng phiên bản core tương thích.',
};

export const pluginSwitchboardStringsByLang: Readonly<
	Record<Lang, IPluginSwitchboardStrings>
> = { en, es, fr, de, it, pt, ja, zh, hi, ar, th, vi };

export const assertPluginSwitchboardStringsComplete = (): readonly string[] =>
	Object.entries(pluginSwitchboardStringsByLang).flatMap(([lang, strings]) =>
		Object.entries(strings)
			.filter(([, value]) => value.trim().length === 0)
			.map(([key]) => `[${lang}] ${key} is empty`),
	);
