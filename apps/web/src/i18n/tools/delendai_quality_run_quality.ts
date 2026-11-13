// i18n catalogue for `delendai_quality_run_quality`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const qualityRunQualityI18n: IToolI18n = {
	description: {
		en: 'With `scope`, execute a quality scope and return a structured pass/fail report. Pass `dryRun: true` to resolve the scope and list commands without spawning them. Without `scope`, and when a validate-output reader is injected, scan the most recent validate findings and return severity-filtered results.',
		es: 'Con `scope`, ejecuta un alcance de calidad y devuelve un informe estructurado de aprobado/suspenso. Pasa `dryRun: true` para resolver el alcance y listar los comandos sin lanzarlos. Sin `scope`, y cuando hay inyectado un lector de la salida de validate, revisa los hallazgos más recientes de validate y devuelve los resultados filtrados por gravedad.',
		fr: 'Avec `scope`, exécute une portée qualité et renvoie un rapport structuré réussite/échec. Passez `dryRun: true` pour résoudre la portée et lister les commandes sans les lancer. Sans `scope`, et quand un lecteur de sortie de validate est injecté, parcourt les constats de validate les plus récents et renvoie les résultats filtrés par gravité.',
		de: 'Mit `scope` führt es einen Qualitätsumfang aus und liefert einen strukturierten Bestanden/Nicht-bestanden-Bericht. Mit `dryRun: true` wird der Umfang aufgelöst und die Befehle werden aufgelistet, ohne sie zu starten. Ohne `scope` und mit einem eingespeisten Leser der validate-Ausgabe durchsucht es die neuesten validate-Befunde und liefert nach Schweregrad gefilterte Ergebnisse.',
		it: "Con `scope`, esegue un ambito di qualità e restituisce un report strutturato superato/non superato. Passa `dryRun: true` per risolvere l'ambito ed elencare i comandi senza avviarli. Senza `scope`, e quando è iniettato un lettore dell'output di validate, esamina i risultati più recenti di validate e restituisce i risultati filtrati per gravità.",
		pt: 'Com `scope`, executa um âmbito de qualidade e devolve um relatório estruturado de aprovado/reprovado. Passe `dryRun: true` para resolver o âmbito e listar os comandos sem os lançar. Sem `scope`, e quando há um leitor da saída de validate injetado, analisa as constatações mais recentes de validate e devolve os resultados filtrados por gravidade.',
		ja: '`scope` を指定すると品質スコープを実行し、構造化された合否レポートを返します。`dryRun: true` を渡すと、スコープを解決してコマンドを一覧表示するだけで起動はしません。`scope` がなく、validate の出力リーダーが注入されている場合は、最新の validate の指摘を走査し、重大度で絞り込んだ結果を返します。',
		zh: '带 `scope` 时,执行一个质量范围并返回结构化的通过/失败报告。传入 `dryRun: true` 只解析该范围并列出命令,而不启动它们。不带 `scope` 且注入了 validate 输出读取器时,扫描最近一次 validate 的发现,并返回按严重程度筛选的结果。',
		hi: '`scope` के साथ, एक गुणवत्ता दायरा चलाता है और संरचित पास/फ़ेल रिपोर्ट लौटाता है। कमांड चलाए बिना दायरा हल करने और उनकी सूची के लिए `dryRun: true` दें। `scope` के बिना, और जब validate-आउटपुट रीडर जोड़ा गया हो, तो सबसे हाल के validate निष्कर्ष जाँचता है और गंभीरता के अनुसार छाँटे परिणाम लौटाता है।',
		ar: 'مع `scope` ينفّذ نطاق جودة ويعيد تقرير نجاح/رسوب منظّمًا. مرّر `dryRun: true` لحلّ النطاق وسرد الأوامر دون تشغيلها. بلا `scope`، وعند حقن قارئ لمخرجات validate، يفحص أحدث نتائج validate ويعيد نتائج مصفّاة حسب الخطورة.',
		th: 'เมื่อระบุ `scope` จะรันขอบเขตคุณภาพและคืนรายงานผ่าน/ไม่ผ่านแบบมีโครงสร้าง ส่ง `dryRun: true` เพื่อแก้ขอบเขตและแสดงรายการคำสั่งโดยไม่รัน เมื่อไม่ระบุ `scope` และมีการฉีดตัวอ่านผลลัพธ์ของ validate จะตรวจข้อค้นพบล่าสุดของ validate และคืนผลลัพธ์ที่กรองตามระดับความรุนแรง',
		vi: 'Khi có `scope`, thực thi một phạm vi chất lượng và trả về báo cáo đạt/không đạt có cấu trúc. Truyền `dryRun: true` để phân giải phạm vi và liệt kê lệnh mà không khởi chạy chúng. Khi không có `scope` và có bộ đọc đầu ra validate được tiêm vào, quét các phát hiện validate gần nhất và trả về kết quả đã lọc theo mức độ nghiêm trọng.',
	},
};
