// i18n catalogue for `proposals_sync_proposals`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const proposalsSyncProposalsI18n: IToolI18n = {
	description: {
		en: 'Regenerate the proposal index from the .md files under the proposals dir. Idempotent. Invoke after any create or rename under the proposals dir. Returns { changed, count, indexPath, errors }.',
		es: 'Regenera el índice de propuestas a partir de los ficheros .md bajo el directorio de proposals. Idempotente. Invócalo después de cualquier creación o renombrado bajo el directorio de proposals. Devuelve { changed, count, indexPath, errors }.',
		fr: "Régénère l'index des propositions à partir des fichiers .md sous le répertoire proposals. Idempotent. À invoquer après toute création ou renommage sous le répertoire proposals. Renvoie { changed, count, indexPath, errors }.",
		de: 'Regeneriert den Vorschlagsindex aus den .md-Dateien im Proposals-Verzeichnis. Idempotent. Nach jedem Erstellen oder Umbenennen im Proposals-Verzeichnis aufrufen. Gibt { changed, count, indexPath, errors } zurück.',
		it: 'Rigenera l indice delle proposte dai file .md nella directory proposals. Idempotente. Invocalo dopo qualsiasi creazione o rinomina nella directory proposals. Restituisce { changed, count, indexPath, errors }.',
		pt: 'Regenera o índice de propostas a partir dos ficheiros .md no diretório proposals. Idempotente. Invocar após qualquer criação ou renomeação no diretório proposals. Devolve { changed, count, indexPath, errors }.',
		ja: 'proposals ディレクトリ下の .md ファイルからインデックスを再生成します。冪等です。proposals ディレクトリ下での作成やリネームの後に呼び出してください。{ changed, count, indexPath, errors } を返します。',
		zh: '从 proposals 目录下的 .md 文件重新生成提案索引。幂等操作。在 proposals 目录下进行任何创建或重命名操作后调用。返回 { changed, count, indexPath, errors }。',
		hi: 'proposals डायरेक्टरी के अंतर्गत .md फ़ाइलों से प्रस्ताव इंडेक्स को पुनर्जीवित करता है। इडमपोटेंट। proposals डायरेक्टरी के अंतर्गत किसी भी निर्माण या नाम परिवर्तन के बाद इसे आमंत्रित करें। { changed, count, indexPath, errors } लौटाता है।',
		ar: 'يعيد إنشاء فهرس الاقتراحات من ملفات .md ضمن دليل proposals. متكرر الأثر (idempotent). استدعِه بعد أي إنشاء أو إعادة تسمية ضمن دليل proposals. يُرجع { changed, count, indexPath, errors }.',
		th: 'สร้างดัชนีข้อเสนอใหม่จากไฟล์ .md ในไดเรกทอรี proposals เป็น idempotent เรียกใช้หลังการสร้างหรือเปลี่ยนชื่อใดๆ ในไดเรกทอรี proposals ส่งคืน { changed, count, indexPath, errors }',
		vi: 'Tạo lại chỉ mục đề xuất từ các tệp .md trong thư mục proposals. Idempotent. Gọi sau bất kỳ lần tạo hoặc đổi tên nào trong thư mục proposals. Trả về { changed, count, indexPath, errors }.',
	},
};
