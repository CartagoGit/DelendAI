// i18n catalogue for `quality_run_quality`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const qualityRunQualityI18n: IToolI18n = {
	description: {
		en: "Execute a quality scope's commands and return a structured pass/fail report (per command: ok, exit code, output tail). Without `scope`, runs the first/`all` scope. This DOES execute the project's commands.",
		es: 'Ejecuta los comandos de un scope de calidad y devuelve un informe estructurado de pass/fail (por comando: ok, código de salida, cola de la salida). Sin `scope`, ejecuta el primer scope/`all`. Esto SÍ ejecuta los comandos del proyecto.',
		fr: "Exécute les commandes d'un scope de qualité et renvoie un rapport structuré pass/fail (par commande : ok, code de sortie, fin de sortie). Sans `scope`, exécute le premier scope/`all`. Cela exécute RÉELLEMENT les commandes du projet.",
		de: 'Führt die Befehle eines Quality-Scopes aus und gibt einen strukturierten Pass/Fail-Bericht zurück (pro Befehl: ok, Exit-Code, Ausgabe-Ende). Ohne `scope` wird der erste/`all`-Scope ausgeführt. Dies führt TATSÄCHLICH die Befehle des Projekts aus.',
		it: 'Esegue i comandi di uno scope di qualità e restituisce un rapporto strutturato pass/fail (per comando: ok, codice di uscita, coda dell output). Senza `scope`, esegue il primo scope/`all`. Questo esegue effettivamente i comandi del progetto.',
		pt: 'Executa os comandos de um scope de qualidade e devolve um relatório estruturado pass/fail (por comando: ok, código de saída, cauda da saída). Sem `scope`, executa o primeiro scope/`all`. Isto EXECUTA mesmo os comandos do projeto.',
		ja: '品質スコープのコマンドを実行し、構造化された pass/fail レポートを返します(コマンドごとに:ok、終了コード、出力の末尾)。`scope` を指定しない場合、最初の/`all` スコープを実行します。これはプロジェクトのコマンドを実際に実行します。',
		zh: '执行某个质量范围的命令,并返回结构化的通过/失败报告(每条命令包含:ok、退出码、输出尾部)。不指定 `scope` 时,运行第一个/`all` 范围。此操作确实会执行项目的命令。',
		hi: 'किसी क्वालिटी scope के कमांड्स को निष्पादित करता है और एक संरचित pass/fail रिपोर्ट लौटाता है (प्रति कमांड: ok, एग्ज़िट कोड, आउटपुट टेल)। `scope` के बिना, पहला/`all` scope चलाता है। यह वास्तव में प्रोजेक्ट के कमांड्स को निष्पादित करता है।',
		ar: 'ينفّذ أوامر نطاق جودة ويُرجع تقريرًا منظمًا للنجاح/الفشل (لكل أمر: ok، رمز الخروج، ذيل المخرجات). بدون `scope`، يشغّل النطاق الأول/`all`. هذا ينفّذ بالفعل أوامر المشروع.',
		th: 'รันคำสั่งของ quality scope และส่งคืนรายงานผ่าน/ไม่ผ่านที่มีโครงสร้าง (ต่อคำสั่ง: ok, exit code, ส่วนท้ายของผลลัพธ์) หากไม่มี `scope` จะรัน scope แรก/`all` สิ่งนี้รันคำสั่งของโปรเจกต์จริง',
		vi: 'Thực thi các lệnh của một scope quality và trả về báo cáo pass/fail có cấu trúc (mỗi lệnh: ok, mã thoát, đoạn cuối output). Không có `scope`, sẽ chạy scope đầu tiên/`all`. Việc này THỰC SỰ thực thi các lệnh của dự án.',
	},
};
