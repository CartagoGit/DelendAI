// i18n catalogue for `mcp-vertex_status`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const mcpVertexStatusI18n: IToolI18n = {
	description: {
		en: 'Aggregate the runtime status of every registered status collector (e.g. a host game-loop, plus the built-in mcp-vertex collector with loaded plugins + counts). Returns { collectors: {id: payload}, errors }. Read-only.',
		es: 'Agrega el estado en tiempo de ejecución de cada colector de estado registrado (p. ej. un game-loop de host, más el colector integrado de mcp-vertex con los plugins cargados y sus recuentos). Devuelve { collectors: {id: payload}, errors }. Solo lectura.',
		fr: "Agrège l'état d'exécution de chaque collecteur de statut enregistré (par ex. une game-loop hôte, plus le collecteur intégré mcp-vertex avec les plugins chargés + comptages). Renvoie { collectors: {id: payload}, errors }. Lecture seule.",
		de: 'Aggregiert den Laufzeitstatus jedes registrierten Status-Collectors (z. B. eine Host-Game-Loop, plus den integrierten mcp-vertex-Collector mit geladenen Plugins + Zählungen). Gibt { collectors: {id: payload}, errors } zurück. Nur lesend.',
		it: 'Aggrega lo stato di runtime di ogni collettore di stato registrato (es. un game-loop host, più il collettore integrato di mcp-vertex con i plugin caricati + conteggi). Restituisce { collectors: {id: payload}, errors }. Solo lettura.',
		pt: 'Agrega o estado de runtime de cada coletor de estado registado (ex. um game-loop de host, mais o coletor integrado do mcp-vertex com os plugins carregados + contagens). Devolve { collectors: {id: payload}, errors }. Apenas leitura.',
		ja: '登録されたすべてのステータスコレクター(例:ホストのゲームループ、および読み込まれたプラグインとカウントを持つ組み込みの mcp-vertex コレクター)の実行時ステータスを集約します。{ collectors: {id: payload}, errors } を返します。読み取り専用。',
		zh: '汇总每个已注册状态收集器的运行时状态(例如宿主的游戏循环,加上内置的 mcp-vertex 收集器,含已加载插件及计数)。返回 { collectors: {id: payload}, errors }。只读。',
		hi: 'हर रजिस्टर किए गए स्टेटस कलेक्टर की रनटाइम स्थिति को एकत्रित करता है (जैसे, होस्ट का गेम-लूप, साथ ही लोड किए गए प्लगइन्स + गणनाओं के साथ बिल्ट-इन mcp-vertex कलेक्टर)। { collectors: {id: payload}, errors } लौटाता है। केवल पढ़ने के लिए।',
		ar: 'يجمع حالة وقت التشغيل لكل مُجمِّع حالة مسجَّل (مثل حلقة لعبة المضيف، بالإضافة إلى مُجمِّع mcp-vertex المدمج مع الإضافات المحمَّلة والعدادات). يُرجع { collectors: {id: payload}, errors }. للقراءة فقط.',
		th: 'รวบรวมสถานะรันไทม์ของตัวเก็บสถานะที่ลงทะเบียนทุกตัว (เช่น game-loop ของโฮสต์ รวมถึงตัวเก็บสถานะ mcp-vertex ในตัวพร้อมปลั๊กอินที่โหลดและจำนวนนับ) ส่งคืน { collectors: {id: payload}, errors } อ่านอย่างเดียว',
		vi: 'Tổng hợp trạng thái runtime của mọi bộ thu thập trạng thái đã đăng ký (ví dụ: game-loop của host, cùng với bộ thu thập mcp-vertex tích hợp sẵn với các plugin đã tải + số lượng). Trả về { collectors: {id: payload}, errors }. Chỉ đọc.',
	},
};
