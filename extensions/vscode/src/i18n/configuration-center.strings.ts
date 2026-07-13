import type { IConfigurationCenterCopy } from '@mcp-vertex/ui-extension/public';

import type { Lang } from './index';

interface IConfigurationCenterStrings {
	readonly copy: IConfigurationCenterCopy;
	readonly panelTitle: string;
	readonly workspaceRequired: string;
	readonly invalidMessage: string;
	readonly savedMessage: string;
	readonly restartAction: string;
	readonly saveAction: string;
}

const strings = (
	copy: IConfigurationCenterCopy,
	host: Omit<IConfigurationCenterStrings, 'copy'>,
): IConfigurationCenterStrings => ({ copy, ...host });

const en = strings(
	{
		title: 'Configuration Center',
		subtitle: 'Project configuration, plugins and owned artifacts',
		searchPlaceholder: 'Search plugins and artifacts',
		save: 'Save changes',
		saving: 'Saving…',
		saved: 'Configuration saved',
		discard: 'Discard',
		restartRequired: 'Restart the MCP server to apply runtime changes.',
		conflict: 'The file changed outside this editor. Reload before saving.',
		invalid: 'Some values need attention before they can be saved.',
		empty: 'Nothing to show here yet.',
		unavailable: 'Ownership metadata is unavailable.',
		active: 'Active',
		inactive: 'Inactive',
		bundled: 'Bundled',
		userLocal: 'Project',
		external: 'External',
		schemaUnavailable:
			'No editable schema advertised; values are preserved.',
		unsupportedField:
			'This field uses raw JSON because its schema is not supported.',
		redacted: 'Secret value hidden',
		custom: 'Custom',
		enabled: 'Enabled',
		enabledDescription: 'Enable this plugin on the next MCP server start.',
		path: 'Path',
		pathDescription:
			'Module path for project-local or external plugin packages.',
		prefix: 'Prefix',
		prefixDescription: 'Optional tool namespace override.',
		options: 'Options',
		pluginOptionsDescription: 'Plugin options',
		serverDefinition: 'Server definition',
		serverDefinitionDescription:
			'External MCP command, arguments and enabled state.',
		providerDefinition: 'Provider definition',
		preservedExtensionField: 'Preserved extension field',
		unknownOwner: 'Unknown owner',
		capabilityTools: 'tools',
		capabilityPrompts: 'prompts',
		capabilityResources: 'resources',
		tabs: {
			general: 'General',
			plugins: 'Plugins',
			providers: 'Providers',
			agents: 'Agents',
			skills: 'Skills',
			prompts: 'Prompts',
			resources: 'Resources',
			knowledge: 'Knowledge',
		},
	},
	{
		panelTitle: 'mcp-vertex Configuration Center',
		workspaceRequired:
			'mcp-vertex: open a workspace before configuring the project.',
		invalidMessage:
			'mcp-vertex: Configuration Center rejected an invalid message.',
		savedMessage: 'mcp-vertex: configuration saved.',
		restartAction: 'Restart server',
		saveAction: 'save configuration',
	},
);

const es = strings(
	{
		title: 'Centro de configuración',
		subtitle: 'Configuración del proyecto, plugins y artefactos asociados',
		searchPlaceholder: 'Buscar plugins y artefactos',
		save: 'Guardar cambios',
		saving: 'Guardando…',
		saved: 'Configuración guardada',
		discard: 'Descartar',
		restartRequired:
			'Reinicia el servidor MCP para aplicar los cambios en ejecución.',
		conflict:
			'El archivo cambió fuera de este editor. Recarga antes de guardar.',
		invalid: 'Algunos valores necesitan revisión antes de guardarse.',
		empty: 'Todavía no hay nada que mostrar.',
		unavailable: 'Los metadatos de procedencia no están disponibles.',
		active: 'Activo',
		inactive: 'Inactivo',
		bundled: 'Integrado',
		userLocal: 'Proyecto',
		external: 'Externo',
		schemaUnavailable:
			'No se ha publicado un esquema editable; los valores se conservarán.',
		unsupportedField:
			'Este campo usa JSON sin procesar porque su esquema no es compatible.',
		redacted: 'Valor secreto oculto',
		custom: 'Personalizado',
		enabled: 'Activo',
		enabledDescription: 'Activa este plugin al reiniciar el servidor MCP.',
		path: 'Ruta',
		pathDescription: 'Ruta del módulo para plugins locales o externos.',
		prefix: 'Prefijo',
		prefixDescription: 'Prefijo opcional para las herramientas.',
		options: 'Opciones',
		pluginOptionsDescription: 'Opciones del plugin',
		serverDefinition: 'Definición del servidor',
		serverDefinitionDescription:
			'Comando, argumentos y estado del MCP externo.',
		providerDefinition: 'Definición del proveedor',
		preservedExtensionField: 'Campo de extensión conservado',
		unknownOwner: 'Propietario desconocido',
		capabilityTools: 'herramientas',
		capabilityPrompts: 'prompts',
		capabilityResources: 'recursos',
		tabs: {
			general: 'General',
			plugins: 'Plugins',
			providers: 'Proveedores',
			agents: 'Agentes',
			skills: 'Skills',
			prompts: 'Prompts',
			resources: 'Recursos',
			knowledge: 'Conocimiento',
		},
	},
	{
		panelTitle: 'Centro de configuración de mcp-vertex',
		workspaceRequired:
			'mcp-vertex: abre un espacio de trabajo antes de configurar el proyecto.',
		invalidMessage:
			'mcp-vertex: el Centro de configuración rechazó un mensaje no válido.',
		savedMessage: 'mcp-vertex: configuración guardada.',
		restartAction: 'Reiniciar servidor',
		saveAction: 'guardar la configuración',
	},
);

const fr = strings(
	{
		title: 'Centre de configuration',
		subtitle: 'Configuration du projet, plugins et artefacts associés',
		searchPlaceholder: 'Rechercher des plugins et artefacts',
		save: 'Enregistrer',
		saving: 'Enregistrement…',
		saved: 'Configuration enregistrée',
		discard: 'Annuler',
		restartRequired:
			'Redémarrez le serveur MCP pour appliquer les changements.',
		conflict:
			'Le fichier a été modifié ailleurs. Rechargez-le avant d’enregistrer.',
		invalid:
			'Certaines valeurs doivent être corrigées avant l’enregistrement.',
		empty: 'Rien à afficher pour le moment.',
		unavailable: 'Les métadonnées de provenance sont indisponibles.',
		active: 'Actif',
		inactive: 'Inactif',
		bundled: 'Intégré',
		userLocal: 'Projet',
		external: 'Externe',
		schemaUnavailable:
			'Aucun schéma modifiable annoncé ; les valeurs sont conservées.',
		unsupportedField:
			'Ce champ utilise du JSON brut car son schéma n’est pas pris en charge.',
		redacted: 'Valeur secrète masquée',
		custom: 'Personnalisé',
		enabled: 'Activé',
		enabledDescription:
			'Active ce plugin au prochain démarrage du serveur MCP.',
		path: 'Chemin',
		pathDescription:
			'Chemin du module pour les plugins locaux ou externes.',
		prefix: 'Préfixe',
		prefixDescription: 'Préfixe facultatif des outils.',
		options: 'Options',
		pluginOptionsDescription: 'Options du plugin',
		serverDefinition: 'Définition du serveur',
		serverDefinitionDescription:
			'Commande, arguments et état du MCP externe.',
		providerDefinition: 'Définition du fournisseur',
		preservedExtensionField: 'Champ d’extension conservé',
		unknownOwner: 'Propriétaire inconnu',
		capabilityTools: 'outils',
		capabilityPrompts: 'prompts',
		capabilityResources: 'ressources',
		tabs: {
			general: 'Général',
			plugins: 'Plugins',
			providers: 'Fournisseurs',
			agents: 'Agents',
			skills: 'Compétences',
			prompts: 'Prompts',
			resources: 'Ressources',
			knowledge: 'Connaissances',
		},
	},
	{
		panelTitle: 'Centre de configuration mcp-vertex',
		workspaceRequired:
			'mcp-vertex : ouvrez un espace de travail avant de configurer le projet.',
		invalidMessage:
			'mcp-vertex : le Centre de configuration a rejeté un message invalide.',
		savedMessage: 'mcp-vertex : configuration enregistrée.',
		restartAction: 'Redémarrer le serveur',
		saveAction: 'enregistrer la configuration',
	},
);

const de = strings(
	{
		title: 'Konfigurationszentrum',
		subtitle: 'Projektkonfiguration, Plugins und zugehörige Artefakte',
		searchPlaceholder: 'Plugins und Artefakte suchen',
		save: 'Änderungen speichern',
		saving: 'Speichern…',
		saved: 'Konfiguration gespeichert',
		discard: 'Verwerfen',
		restartRequired:
			'Starte den MCP-Server neu, um Laufzeitänderungen anzuwenden.',
		conflict:
			'Die Datei wurde außerhalb dieses Editors geändert. Vor dem Speichern neu laden.',
		invalid: 'Einige Werte müssen vor dem Speichern korrigiert werden.',
		empty: 'Noch nichts anzuzeigen.',
		unavailable: 'Herkunftsmetadaten sind nicht verfügbar.',
		active: 'Aktiv',
		inactive: 'Inaktiv',
		bundled: 'Integriert',
		userLocal: 'Projekt',
		external: 'Extern',
		schemaUnavailable:
			'Kein bearbeitbares Schema veröffentlicht; Werte bleiben erhalten.',
		unsupportedField:
			'Dieses Feld verwendet Roh-JSON, da sein Schema nicht unterstützt wird.',
		redacted: 'Geheimer Wert ausgeblendet',
		custom: 'Benutzerdefiniert',
		enabled: 'Aktiviert',
		enabledDescription:
			'Aktiviert dieses Plugin beim nächsten MCP-Serverstart.',
		path: 'Pfad',
		pathDescription: 'Modulpfad für lokale oder externe Plugins.',
		prefix: 'Präfix',
		prefixDescription: 'Optionales Werkzeug-Namensraumpräfix.',
		options: 'Optionen',
		pluginOptionsDescription: 'Plugin-Optionen',
		serverDefinition: 'Serverdefinition',
		serverDefinitionDescription:
			'Befehl, Argumente und Status des externen MCP.',
		providerDefinition: 'Providerdefinition',
		preservedExtensionField: 'Beibehaltenes Erweiterungsfeld',
		unknownOwner: 'Unbekannter Besitzer',
		capabilityTools: 'Werkzeuge',
		capabilityPrompts: 'Prompts',
		capabilityResources: 'Ressourcen',
		tabs: {
			general: 'Allgemein',
			plugins: 'Plugins',
			providers: 'Provider',
			agents: 'Agenten',
			skills: 'Skills',
			prompts: 'Prompts',
			resources: 'Ressourcen',
			knowledge: 'Wissen',
		},
	},
	{
		panelTitle: 'mcp-vertex Konfigurationszentrum',
		workspaceRequired:
			'mcp-vertex: Öffne einen Arbeitsbereich, bevor du das Projekt konfigurierst.',
		invalidMessage:
			'mcp-vertex: Das Konfigurationszentrum hat eine ungültige Nachricht abgelehnt.',
		savedMessage: 'mcp-vertex: Konfiguration gespeichert.',
		restartAction: 'Server neu starten',
		saveAction: 'Konfiguration speichern',
	},
);

const it = strings(
	{
		title: 'Centro configurazione',
		subtitle: 'Configurazione del progetto, plugin e artefatti associati',
		searchPlaceholder: 'Cerca plugin e artefatti',
		save: 'Salva modifiche',
		saving: 'Salvataggio…',
		saved: 'Configurazione salvata',
		discard: 'Annulla',
		restartRequired: 'Riavvia il server MCP per applicare le modifiche.',
		conflict:
			'Il file è cambiato fuori da questo editor. Ricaricalo prima di salvare.',
		invalid: 'Alcuni valori richiedono attenzione prima del salvataggio.',
		empty: 'Non c’è ancora nulla da mostrare.',
		unavailable: 'I metadati di provenienza non sono disponibili.',
		active: 'Attivo',
		inactive: 'Inattivo',
		bundled: 'Integrato',
		userLocal: 'Progetto',
		external: 'Esterno',
		schemaUnavailable:
			'Nessuno schema modificabile pubblicato; i valori saranno conservati.',
		unsupportedField:
			'Questo campo usa JSON grezzo perché il suo schema non è supportato.',
		redacted: 'Valore segreto nascosto',
		custom: 'Personalizzato',
		enabled: 'Attivo',
		enabledDescription:
			'Attiva questo plugin al prossimo avvio del server MCP.',
		path: 'Percorso',
		pathDescription: 'Percorso del modulo per plugin locali o esterni.',
		prefix: 'Prefisso',
		prefixDescription: 'Prefisso opzionale degli strumenti.',
		options: 'Opzioni',
		pluginOptionsDescription: 'Opzioni del plugin',
		serverDefinition: 'Definizione del server',
		serverDefinitionDescription:
			'Comando, argomenti e stato del MCP esterno.',
		providerDefinition: 'Definizione del provider',
		preservedExtensionField: 'Campo di estensione conservato',
		unknownOwner: 'Proprietario sconosciuto',
		capabilityTools: 'strumenti',
		capabilityPrompts: 'prompt',
		capabilityResources: 'risorse',
		tabs: {
			general: 'Generale',
			plugins: 'Plugin',
			providers: 'Provider',
			agents: 'Agenti',
			skills: 'Skill',
			prompts: 'Prompt',
			resources: 'Risorse',
			knowledge: 'Conoscenza',
		},
	},
	{
		panelTitle: 'Centro configurazione mcp-vertex',
		workspaceRequired:
			'mcp-vertex: apri uno spazio di lavoro prima di configurare il progetto.',
		invalidMessage:
			'mcp-vertex: il Centro configurazione ha rifiutato un messaggio non valido.',
		savedMessage: 'mcp-vertex: configurazione salvata.',
		restartAction: 'Riavvia server',
		saveAction: 'salvare la configurazione',
	},
);

const pt = strings(
	{
		title: 'Central de configuração',
		subtitle: 'Configuração do projeto, plugins e artefatos associados',
		searchPlaceholder: 'Buscar plugins e artefatos',
		save: 'Salvar alterações',
		saving: 'Salvando…',
		saved: 'Configuração salva',
		discard: 'Descartar',
		restartRequired: 'Reinicie o servidor MCP para aplicar as alterações.',
		conflict:
			'O arquivo foi alterado fora deste editor. Recarregue antes de salvar.',
		invalid: 'Alguns valores precisam de atenção antes de serem salvos.',
		empty: 'Ainda não há nada para mostrar.',
		unavailable: 'Os metadados de origem não estão disponíveis.',
		active: 'Ativo',
		inactive: 'Inativo',
		bundled: 'Integrado',
		userLocal: 'Projeto',
		external: 'Externo',
		schemaUnavailable:
			'Nenhum esquema editável foi publicado; os valores serão preservados.',
		unsupportedField:
			'Este campo usa JSON bruto porque seu esquema não é compatível.',
		redacted: 'Valor secreto oculto',
		custom: 'Personalizado',
		enabled: 'Ativo',
		enabledDescription:
			'Ativa este plugin na próxima inicialização do servidor MCP.',
		path: 'Caminho',
		pathDescription: 'Caminho do módulo para plugins locais ou externos.',
		prefix: 'Prefixo',
		prefixDescription: 'Prefixo opcional das ferramentas.',
		options: 'Opções',
		pluginOptionsDescription: 'Opções do plugin',
		serverDefinition: 'Definição do servidor',
		serverDefinitionDescription:
			'Comando, argumentos e estado do MCP externo.',
		providerDefinition: 'Definição do provedor',
		preservedExtensionField: 'Campo de extensão preservado',
		unknownOwner: 'Proprietário desconhecido',
		capabilityTools: 'ferramentas',
		capabilityPrompts: 'prompts',
		capabilityResources: 'recursos',
		tabs: {
			general: 'Geral',
			plugins: 'Plugins',
			providers: 'Provedores',
			agents: 'Agentes',
			skills: 'Skills',
			prompts: 'Prompts',
			resources: 'Recursos',
			knowledge: 'Conhecimento',
		},
	},
	{
		panelTitle: 'Central de configuração do mcp-vertex',
		workspaceRequired:
			'mcp-vertex: abra um espaço de trabalho antes de configurar o projeto.',
		invalidMessage:
			'mcp-vertex: a Central de configuração rejeitou uma mensagem inválida.',
		savedMessage: 'mcp-vertex: configuração salva.',
		restartAction: 'Reiniciar servidor',
		saveAction: 'salvar a configuração',
	},
);

const ja = strings(
	{
		title: '設定センター',
		subtitle: 'プロジェクト設定、プラグイン、関連アーティファクト',
		searchPlaceholder: 'プラグインとアーティファクトを検索',
		save: '変更を保存',
		saving: '保存中…',
		saved: '設定を保存しました',
		discard: '破棄',
		restartRequired:
			'実行時の変更を適用するには MCP サーバーを再起動してください。',
		conflict:
			'このファイルは外部で変更されました。保存前に再読み込みしてください。',
		invalid: '保存前に修正が必要な値があります。',
		empty: '表示する項目はまだありません。',
		unavailable: '所有元メタデータを利用できません。',
		active: '有効',
		inactive: '無効',
		bundled: '同梱',
		userLocal: 'プロジェクト',
		external: '外部',
		schemaUnavailable:
			'編集可能なスキーマが公開されていないため、値は保持されます。',
		unsupportedField:
			'スキーマが未対応のため、このフィールドは生の JSON を使用します。',
		redacted: 'シークレット値を非表示',
		custom: 'カスタム',
		enabled: '有効',
		enabledDescription:
			'次回の MCP サーバー起動時にこのプラグインを有効にします。',
		path: 'パス',
		pathDescription: 'ローカルまたは外部プラグインのモジュールパス。',
		prefix: 'プレフィックス',
		prefixDescription: '任意のツール名前空間プレフィックス。',
		options: 'オプション',
		pluginOptionsDescription: 'プラグインのオプション',
		serverDefinition: 'サーバー定義',
		serverDefinitionDescription: '外部 MCP のコマンド、引数、有効状態。',
		providerDefinition: 'プロバイダー定義',
		preservedExtensionField: '保持された拡張フィールド',
		unknownOwner: '所有者不明',
		capabilityTools: 'ツール',
		capabilityPrompts: 'プロンプト',
		capabilityResources: 'リソース',
		tabs: {
			general: '一般',
			plugins: 'プラグイン',
			providers: 'プロバイダー',
			agents: 'エージェント',
			skills: 'スキル',
			prompts: 'プロンプト',
			resources: 'リソース',
			knowledge: 'ナレッジ',
		},
	},
	{
		panelTitle: 'mcp-vertex 設定センター',
		workspaceRequired:
			'mcp-vertex: プロジェクトを設定する前にワークスペースを開いてください。',
		invalidMessage:
			'mcp-vertex: 設定センターが無効なメッセージを拒否しました。',
		savedMessage: 'mcp-vertex: 設定を保存しました。',
		restartAction: 'サーバーを再起動',
		saveAction: '設定の保存',
	},
);

const zh = strings(
	{
		title: '配置中心',
		subtitle: '项目配置、插件及其所属产物',
		searchPlaceholder: '搜索插件和产物',
		save: '保存更改',
		saving: '正在保存…',
		saved: '配置已保存',
		discard: '放弃',
		restartRequired: '请重启 MCP 服务器以应用运行时更改。',
		conflict: '文件已在此编辑器外被修改，请重新加载后再保存。',
		invalid: '部分值需要修正后才能保存。',
		empty: '暂无可显示内容。',
		unavailable: '来源元数据不可用。',
		active: '已启用',
		inactive: '未启用',
		bundled: '内置',
		userLocal: '项目',
		external: '外部',
		schemaUnavailable: '未提供可编辑架构；现有值将被保留。',
		unsupportedField: '此字段的架构不受支持，因此使用原始 JSON。',
		redacted: '密钥值已隐藏',
		custom: '自定义',
		enabled: '已启用',
		enabledDescription: '下次启动 MCP 服务器时启用此插件。',
		path: '路径',
		pathDescription: '项目本地或外部插件的模块路径。',
		prefix: '前缀',
		prefixDescription: '可选的工具命名空间前缀。',
		options: '选项',
		pluginOptionsDescription: '插件选项',
		serverDefinition: '服务器定义',
		serverDefinitionDescription: '外部 MCP 的命令、参数和启用状态。',
		providerDefinition: '提供商定义',
		preservedExtensionField: '保留的扩展字段',
		unknownOwner: '未知所有者',
		capabilityTools: '工具',
		capabilityPrompts: '提示词',
		capabilityResources: '资源',
		tabs: {
			general: '常规',
			plugins: '插件',
			providers: '提供商',
			agents: '智能体',
			skills: '技能',
			prompts: '提示词',
			resources: '资源',
			knowledge: '知识',
		},
	},
	{
		panelTitle: 'mcp-vertex 配置中心',
		workspaceRequired: 'mcp-vertex：请先打开工作区再配置项目。',
		invalidMessage: 'mcp-vertex：配置中心拒绝了无效消息。',
		savedMessage: 'mcp-vertex：配置已保存。',
		restartAction: '重启服务器',
		saveAction: '保存配置',
	},
);

const hi = strings(
	{
		title: 'कॉन्फ़िगरेशन केंद्र',
		subtitle: 'प्रोजेक्ट कॉन्फ़िगरेशन, प्लगइन और संबद्ध आर्टिफ़ैक्ट',
		searchPlaceholder: 'प्लगइन और आर्टिफ़ैक्ट खोजें',
		save: 'बदलाव सहेजें',
		saving: 'सहेजा जा रहा है…',
		saved: 'कॉन्फ़िगरेशन सहेजा गया',
		discard: 'हटाएँ',
		restartRequired: 'रनटाइम बदलाव लागू करने के लिए MCP सर्वर पुनः शुरू करें।',
		conflict: 'फ़ाइल इस संपादक के बाहर बदली गई है। सहेजने से पहले पुनः लोड करें।',
		invalid: 'सहेजने से पहले कुछ मान ठीक करने होंगे।',
		empty: 'अभी दिखाने के लिए कुछ नहीं है।',
		unavailable: 'स्रोत मेटाडेटा उपलब्ध नहीं है।',
		active: 'सक्रिय',
		inactive: 'निष्क्रिय',
		bundled: 'अंतर्निहित',
		userLocal: 'प्रोजेक्ट',
		external: 'बाहरी',
		schemaUnavailable:
			'कोई संपादन योग्य स्कीमा प्रकाशित नहीं है; मान सुरक्षित रहेंगे।',
		unsupportedField:
			'स्कीमा समर्थित न होने के कारण यह फ़ील्ड कच्चा JSON उपयोग करता है।',
		redacted: 'गुप्त मान छिपा है',
		custom: 'कस्टम',
		enabled: 'सक्रिय',
		enabledDescription: 'अगले MCP सर्वर आरंभ पर इस प्लगइन को सक्रिय करें।',
		path: 'पथ',
		pathDescription: 'स्थानीय या बाहरी प्लगइन पैकेज का मॉड्यूल पथ।',
		prefix: 'प्रीफ़िक्स',
		prefixDescription: 'वैकल्पिक टूल नेमस्पेस प्रीफ़िक्स।',
		options: 'विकल्प',
		pluginOptionsDescription: 'प्लगइन विकल्प',
		serverDefinition: 'सर्वर परिभाषा',
		serverDefinitionDescription: 'बाहरी MCP कमांड, तर्क और सक्रिय स्थिति।',
		providerDefinition: 'प्रदाता परिभाषा',
		preservedExtensionField: 'संरक्षित एक्सटेंशन फ़ील्ड',
		unknownOwner: 'अज्ञात स्वामी',
		capabilityTools: 'टूल',
		capabilityPrompts: 'प्रॉम्प्ट',
		capabilityResources: 'संसाधन',
		tabs: {
			general: 'सामान्य',
			plugins: 'प्लगइन',
			providers: 'प्रदाता',
			agents: 'एजेंट',
			skills: 'स्किल',
			prompts: 'प्रॉम्प्ट',
			resources: 'संसाधन',
			knowledge: 'ज्ञान',
		},
	},
	{
		panelTitle: 'mcp-vertex कॉन्फ़िगरेशन केंद्र',
		workspaceRequired: 'mcp-vertex: प्रोजेक्ट कॉन्फ़िगर करने से पहले वर्कस्पेस खोलें।',
		invalidMessage: 'mcp-vertex: कॉन्फ़िगरेशन केंद्र ने अमान्य संदेश अस्वीकार किया।',
		savedMessage: 'mcp-vertex: कॉन्फ़िगरेशन सहेजा गया।',
		restartAction: 'सर्वर पुनः शुरू करें',
		saveAction: 'कॉन्फ़िगरेशन सहेजना',
	},
);

const ar = strings(
	{
		title: 'مركز الإعدادات',
		subtitle: 'إعدادات المشروع والإضافات والعناصر التابعة لها',
		searchPlaceholder: 'ابحث في الإضافات والعناصر',
		save: 'حفظ التغييرات',
		saving: 'جارٍ الحفظ…',
		saved: 'تم حفظ الإعدادات',
		discard: 'تجاهل',
		restartRequired: 'أعد تشغيل خادم MCP لتطبيق تغييرات وقت التشغيل.',
		conflict: 'تغيّر الملف خارج هذا المحرر. أعد تحميله قبل الحفظ.',
		invalid: 'تحتاج بعض القيم إلى المراجعة قبل الحفظ.',
		empty: 'لا يوجد شيء لعرضه بعد.',
		unavailable: 'بيانات المصدر غير متاحة.',
		active: 'نشط',
		inactive: 'غير نشط',
		bundled: 'مدمج',
		userLocal: 'المشروع',
		external: 'خارجي',
		schemaUnavailable: 'لم يُنشر مخطط قابل للتحرير؛ ستُحفظ القيم.',
		unsupportedField: 'يستخدم هذا الحقل JSON خامًا لأن مخططه غير مدعوم.',
		redacted: 'القيمة السرية مخفية',
		custom: 'مخصص',
		enabled: 'مفعّل',
		enabledDescription: 'فعّل هذه الإضافة عند التشغيل التالي لخادم MCP.',
		path: 'المسار',
		pathDescription: 'مسار الوحدة للإضافات المحلية أو الخارجية.',
		prefix: 'البادئة',
		prefixDescription: 'بادئة اختيارية لنطاق أسماء الأدوات.',
		options: 'الخيارات',
		pluginOptionsDescription: 'خيارات الإضافة',
		serverDefinition: 'تعريف الخادم',
		serverDefinitionDescription: 'أمر MCP الخارجي ووسائطه وحالة تفعيله.',
		providerDefinition: 'تعريف المزوّد',
		preservedExtensionField: 'حقل امتداد محفوظ',
		unknownOwner: 'مالك غير معروف',
		capabilityTools: 'أدوات',
		capabilityPrompts: 'موجّهات',
		capabilityResources: 'موارد',
		tabs: {
			general: 'عام',
			plugins: 'الإضافات',
			providers: 'المزوّدون',
			agents: 'الوكلاء',
			skills: 'المهارات',
			prompts: 'الموجّهات',
			resources: 'الموارد',
			knowledge: 'المعرفة',
		},
	},
	{
		panelTitle: 'مركز إعدادات mcp-vertex',
		workspaceRequired: 'mcp-vertex: افتح مساحة عمل قبل إعداد المشروع.',
		invalidMessage: 'mcp-vertex: رفض مركز الإعدادات رسالة غير صالحة.',
		savedMessage: 'mcp-vertex: تم حفظ الإعدادات.',
		restartAction: 'إعادة تشغيل الخادم',
		saveAction: 'حفظ الإعدادات',
	},
);

const th = strings(
	{
		title: 'ศูนย์การกำหนดค่า',
		subtitle: 'การกำหนดค่าโปรเจกต์ ปลั๊กอิน และอาร์ติแฟกต์ที่เกี่ยวข้อง',
		searchPlaceholder: 'ค้นหาปลั๊กอินและอาร์ติแฟกต์',
		save: 'บันทึกการเปลี่ยนแปลง',
		saving: 'กำลังบันทึก…',
		saved: 'บันทึกการกำหนดค่าแล้ว',
		discard: 'ละทิ้ง',
		restartRequired: 'รีสตาร์ทเซิร์ฟเวอร์ MCP เพื่อใช้การเปลี่ยนแปลงขณะทำงาน',
		conflict: 'ไฟล์ถูกเปลี่ยนจากภายนอกตัวแก้ไข โปรดโหลดใหม่ก่อนบันทึก',
		invalid: 'ค่าบางรายการต้องแก้ไขก่อนบันทึก',
		empty: 'ยังไม่มีสิ่งที่จะแสดง',
		unavailable: 'ไม่มีข้อมูลแหล่งที่มา',
		active: 'ใช้งาน',
		inactive: 'ไม่ใช้งาน',
		bundled: 'รวมมาให้',
		userLocal: 'โปรเจกต์',
		external: 'ภายนอก',
		schemaUnavailable: 'ไม่มีสคีมาที่แก้ไขได้ ค่าจะถูกเก็บไว้',
		unsupportedField: 'ฟิลด์นี้ใช้ JSON ดิบเนื่องจากไม่รองรับสคีมา',
		redacted: 'ซ่อนค่าลับแล้ว',
		custom: 'กำหนดเอง',
		enabled: 'เปิดใช้งาน',
		enabledDescription: 'เปิดใช้ปลั๊กอินนี้เมื่อเริ่มเซิร์ฟเวอร์ MCP ครั้งถัดไป',
		path: 'พาธ',
		pathDescription: 'พาธโมดูลสำหรับปลั๊กอินในโปรเจกต์หรือภายนอก',
		prefix: 'คำนำหน้า',
		prefixDescription: 'คำนำหน้าเนมสเปซเครื่องมือแบบเลือกได้',
		options: 'ตัวเลือก',
		pluginOptionsDescription: 'ตัวเลือกปลั๊กอิน',
		serverDefinition: 'ข้อกำหนดเซิร์ฟเวอร์',
		serverDefinitionDescription: 'คำสั่ง อาร์กิวเมนต์ และสถานะ MCP ภายนอก',
		providerDefinition: 'ข้อกำหนดผู้ให้บริการ',
		preservedExtensionField: 'ฟิลด์ส่วนขยายที่เก็บไว้',
		unknownOwner: 'ไม่ทราบเจ้าของ',
		capabilityTools: 'เครื่องมือ',
		capabilityPrompts: 'พรอมต์',
		capabilityResources: 'ทรัพยากร',
		tabs: {
			general: 'ทั่วไป',
			plugins: 'ปลั๊กอิน',
			providers: 'ผู้ให้บริการ',
			agents: 'เอเจนต์',
			skills: 'สกิล',
			prompts: 'พรอมต์',
			resources: 'ทรัพยากร',
			knowledge: 'ความรู้',
		},
	},
	{
		panelTitle: 'ศูนย์การกำหนดค่า mcp-vertex',
		workspaceRequired: 'mcp-vertex: เปิดเวิร์กสเปซก่อนกำหนดค่าโปรเจกต์',
		invalidMessage: 'mcp-vertex: ศูนย์การกำหนดค่าปฏิเสธข้อความที่ไม่ถูกต้อง',
		savedMessage: 'mcp-vertex: บันทึกการกำหนดค่าแล้ว',
		restartAction: 'รีสตาร์ทเซิร์ฟเวอร์',
		saveAction: 'บันทึกการกำหนดค่า',
	},
);

const vi = strings(
	{
		title: 'Trung tâm cấu hình',
		subtitle: 'Cấu hình dự án, plugin và các tạo tác liên quan',
		searchPlaceholder: 'Tìm plugin và tạo tác',
		save: 'Lưu thay đổi',
		saving: 'Đang lưu…',
		saved: 'Đã lưu cấu hình',
		discard: 'Hủy bỏ',
		restartRequired:
			'Khởi động lại máy chủ MCP để áp dụng thay đổi khi chạy.',
		conflict:
			'Tệp đã thay đổi bên ngoài trình sửa này. Hãy tải lại trước khi lưu.',
		invalid: 'Một số giá trị cần được sửa trước khi lưu.',
		empty: 'Chưa có gì để hiển thị.',
		unavailable: 'Không có siêu dữ liệu nguồn gốc.',
		active: 'Hoạt động',
		inactive: 'Không hoạt động',
		bundled: 'Tích hợp',
		userLocal: 'Dự án',
		external: 'Bên ngoài',
		schemaUnavailable:
			'Không có lược đồ chỉnh sửa; các giá trị sẽ được giữ nguyên.',
		unsupportedField:
			'Trường này dùng JSON thô vì lược đồ chưa được hỗ trợ.',
		redacted: 'Đã ẩn giá trị bí mật',
		custom: 'Tùy chỉnh',
		enabled: 'Đã bật',
		enabledDescription: 'Bật plugin này khi máy chủ MCP khởi động lần tới.',
		path: 'Đường dẫn',
		pathDescription: 'Đường dẫn mô-đun cho plugin cục bộ hoặc bên ngoài.',
		prefix: 'Tiền tố',
		prefixDescription: 'Tiền tố không gian tên công cụ tùy chọn.',
		options: 'Tùy chọn',
		pluginOptionsDescription: 'Tùy chọn plugin',
		serverDefinition: 'Định nghĩa máy chủ',
		serverDefinitionDescription:
			'Lệnh, đối số và trạng thái MCP bên ngoài.',
		providerDefinition: 'Định nghĩa nhà cung cấp',
		preservedExtensionField: 'Trường mở rộng được giữ lại',
		unknownOwner: 'Không rõ chủ sở hữu',
		capabilityTools: 'công cụ',
		capabilityPrompts: 'prompt',
		capabilityResources: 'tài nguyên',
		tabs: {
			general: 'Chung',
			plugins: 'Plugin',
			providers: 'Nhà cung cấp',
			agents: 'Tác nhân',
			skills: 'Kỹ năng',
			prompts: 'Prompt',
			resources: 'Tài nguyên',
			knowledge: 'Kiến thức',
		},
	},
	{
		panelTitle: 'Trung tâm cấu hình mcp-vertex',
		workspaceRequired:
			'mcp-vertex: hãy mở workspace trước khi cấu hình dự án.',
		invalidMessage:
			'mcp-vertex: Trung tâm cấu hình đã từ chối thông điệp không hợp lệ.',
		savedMessage: 'mcp-vertex: đã lưu cấu hình.',
		restartAction: 'Khởi động lại máy chủ',
		saveAction: 'lưu cấu hình',
	},
);

export const configurationCenterStringsByLang: Readonly<
	Record<Lang, IConfigurationCenterStrings>
> = { en, es, fr, de, it, pt, ja, zh, hi, ar, th, vi };

export const assertConfigurationCenterStringsComplete =
	(): readonly string[] => {
		const problems: string[] = [];
		for (const [lang, entry] of Object.entries(
			configurationCenterStringsByLang,
		)) {
			const { copy, ...host } = entry;
			const { tabs, ...copyText } = copy;
			const values = { ...host, ...copyText, ...tabs };
			for (const [key, value] of Object.entries(values)) {
				if (typeof value !== 'string' || value.trim().length === 0)
					problems.push(`[${lang}] ${key} is empty`);
			}
		}
		return problems;
	};
