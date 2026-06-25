import type { LangDict } from '#I18N/shared';
import { logsByLang } from '#I18N/logs';
import { proposalGlossaryByLang, recoveryByLang } from '#I18N/proposals';

const dict: LangDict = {
	nav: {
		concept: 'अवधारणा',
		install: 'इंस्टॉल',
		setup: 'सेटअप',
		capabilities: 'क्षमताएँ',
		tools: 'टूल',
		benchmarks: 'बेंचमार्क',
		plugins: 'प्लगइन',
		presets: 'प्रीसेट्स',
		github: 'GitHub',
		menu: 'मेन्यू',
		knowledge: 'ज्ञान',
		prompts: 'प्रॉम्प्ट',
		resources: 'संसाधन',
		skills: 'कौशल',
		guide: 'गाइड',
		more: 'और',
		firstFiveMinutes: 'पहले 5 मिनट',
		troubleshooting: 'समस्या निवारण',
	},
	hero: {
		title: { a: 'प्रोजेक्ट-निरपेक्ष ', b: 'MCP Vertex', c: '' },
		subheader: 'किसी भी प्रोजेक्ट के लिए MCP सर्वर कोर + प्लगइन लोडर।',
		tagline:
			'एक प्रोजेक्ट-निरपेक्ष Model Context Protocol सर्वर कोर। कोर को आपके डोमेन के बारे में कुछ नहीं पता — क्षमताएँ प्लगइन के रूप में आती हैं जिन्हें आप माँग पर लोड करते हैं, सभी कम टोकन लागत के लिए मापी गई।',
		ctaInstall: 'शुरू करें',
		ctaTools: 'टूल देखें',
		runsOn: 'Node, Deno और bun पर चलता है · कोई भी पैकेज मैनेजर',
	},
	marquee: {
		runtimes: 'किससे बना · किस पर चलता',
		clients: 'MCP क्लाइंट और मॉडल',
	},
	concept: {
		title: 'एक छोटा कोर, कई प्लगइन',
		body: 'mcp-vertex वह सीलबंद कोर है: नियतात्मक टूल पंजीकरण, इंजेक्ट किए गए workspace पथ, एक CLI प्लगइन लोडर, और टोकन में मापी गई टूल सतह। डोमेन-विशिष्ट सब कुछ एक प्लगइन है — केवल वही लोड करें जो चाहिए, किसी भी होस्ट या मॉडल के तहत।',
		f1: {
			t: 'प्रोजेक्ट-निरपेक्ष',
			b: 'कोर में कोई डोमेन कोड नहीं। वही प्लगइन हर होस्ट या मॉडल पर एक जैसा व्यवहार करता है।',
		},
		f2: {
			t: 'डिज़ाइन से कम-टोकन',
			b: 'एकल overview, आलसी ज्ञान और संक्षिप्त JSON। एक मापा बजट CI में रिग्रेशन रोकता है।',
		},
		f3: {
			t: 'सुरक्षित समवर्तीता',
			b: 'परमाणु लेखन, स्वामित्व टोकन वाला क्रॉस-प्रोसेस म्यूटेक्स, और भ्रष्टाचार क्वारंटाइन।',
		},
		f4: {
			t: 'मल्टी-एजेंट के लिए तैयार',
			b: 'proposals प्लगइन एक swarm समन्वयित करता है: लॉक, कार्य कतार, slice असंयुक्तता और पुश सूचनाएँ।',
		},
	},
	install: {
		title: 'इंस्टॉल और चलाएँ',
		lead: 'इसे जोड़ें और अपने MCP क्लाइंट को mcp-vertex बाइनरी की ओर इंगित करें:',
		verify: 'चलता है यह जाँचें',
		addto: 'अपने IDE / एजेंट में जोड़ें',
		presets: 'प्रीसेट:',
		oneCmd: 'एक कमांड · कोई भी IDE',
		oneCmdNote:
			'आपका IDE पहचानकर mcp-vertex जोड़ता है — आपके बाकी MCP सर्वर को छुए बिना।',
		config: 'एक प्रीसेट चुनें (minimal · standard · swarm · full) या प्लगइन स्पष्ट रूप से सूचीबद्ध करें। स्व-निदान के लिए --check के साथ चलाएँ।',
		excludeHelp:
			'--exclude-plugins= (उपनाम: --excludePlugins=) के साथ हल प्लगइन सेट से प्लगइन्स हटाएँ। प्रीसेट से किसी प्लगइन को फोर्क किए बिना हटाने के लिए उपयोगी — उदा. --preset=swarm --exclude-plugins=notification एकल-एजेंट सत्र के लिए।',
		tabsPackageManager: 'पैकेज मैनेजर',
		tabsIde: 'IDE / एजेंट',
		tabsPreset: 'प्रीसेट',
		pmStep1Title: '1. प्रारंभ करें',
		pmStep1Body:
			'एक-कमांड इंस्टॉलर चलाएँ। यह आपका एडिटर पहचानता है, कॉन्फ़िगरेशन मर्ज करता है, और जो किया वह प्रिंट करता है।',
		pmStep2Title: '2. सत्यापित करें',
		pmStep2Body: 'स्व-निदान के लिए उसी पैकेज मैनेजर को `--check` के साथ चलाएँ।',
		pmRecommend: 'अनुशंसित',
		ideFileLabel: 'कॉन्फ़िग फ़ाइल',
		ideScopeLabel: 'स्कोप',
		ideScopeProject: 'प्रोजेक्ट',
		ideScopeGlobal: 'वैश्विक',
		ideScopeBoth: 'प्रोजेक्ट / वैश्विक',
		ideWhyLabel: 'यह आकृति क्यों?',
		ideWhyBody:
			'हर IDE थोड़ा अलग JSON कुंजी (`mcpServers`, `servers`, `context_servers`) और अलग पथ उपयोग करता है। रेंडरर स्वतः अनुकूलित होता है — ज्यों का त्यों पेस्ट करें।',
		presetSizeLabel: 'प्लगइन्स',
		presetUseLabel: 'के लिए उपयोग',
		presetPluginsLabel: 'शामिल प्लगइन्स',
		presetFoot:
			'`--preset=<name>` के साथ कोई भी प्रीसेट सर्वर को दें। प्रीसेट्स योगात्मक हैं — आप फोर्क किए बिना `--include-plugins=` और `--exclude-plugins=` को मिलाकर बारीक़ी से सेट कर सकते हैं।',
		copy: 'कॉपी करें',
		copied: 'कॉपी हो गया!',
		faqTitle: 'अक्सर पूछे जाने वाले प्रश्न',
		faqQ1: '`deno run -A npm:@mcp-vertex/core` धीमे क्यों शुरू होता है?',
		faqA1: 'Deno पहले उपयोग पर npm पैकेज हल और सत्यापित करता है। बाद के रन `~/.cache/deno` में कैश का पुनः उपयोग करते हैं। बार-बार शुरू करने के लिए bun या npx बेहतर है।',
		faqQ2: 'मेरा IDE सूची में नहीं है — अब क्या?',
		faqA2: 'कोई भी IDE जो stdio MCP सर्वर स्वीकार करता है, काम करता है। VS Code का JSON लें, फ़ाइल पथ अपने IDE की अपेक्षा के अनुसार बदलें, और वही कमांड + तर्क पंजीकृत करें।',
		faqQ3: 'क्या मैं एक साथ कई प्रीसेट चला सकता हूँ?',
		faqA3: 'नहीं — एक सर्वर, एक प्रीसेट। यदि प्रति-प्रोजेक्ट अलग प्लगइन सेट चाहिए, तो उस प्रोजेक्ट में `mcp-vertex.config.json` रखें और लोडर उसे पहले पढ़ेगा।',
	},
	tools: {
		title: 'टूल',
		lead: 'पूर्ण प्लगइन सेट द्वारा उजागर हर टूल, namespace के अनुसार समूहित — जीवित रजिस्ट्री से लिया गया, इसलिए यह पृष्ठ कभी कोड से अलग नहीं होता।',
		count: 'टूल',
		packages: 'पैकेज',
	},
	bench: {
		title: 'मापा गया, दावा नहीं',
		lead: 'टोकन दक्षता एक संरक्षित अपरिवर्तनीय है — यदि ये सीमाएँ रिग्रेस हों तो CI टेस्ट विफल होता है।',
		b1: {
			t: 'कोल्ड-स्टार्ट',
			b: 'overview (संक्षिप्त) + auto_work — 300 टोकन से कम में पूर्ण अभिविन्यास।',
		},
		b2: {
			t: 'कोई पोलिंग नहीं',
			b: 'लॉक-रिलीज़ पुश किया जाता है (notification प्लगइन), लूप में पोल नहीं।',
		},
		b3: {
			t: 'ड्रिफ्ट-संरक्षित',
			b: 'एक जनित टाइप SDK, टोकन बजट और असली प्रोटोकॉल पर सख्त e2e जाल।',
		},
		live: {
			title: 'अभिविन्यास लागत · सीधे मापा गया',
			note: 'एजेंट जो परिणाम पाठ देखता है उसके टोकन (≈4 बाइट/टोकन), proposals+memory के साथ प्रोटोकॉल पर सीधे मापे गए। बेसलाइन हाथ से अभिविन्यास का एक उदाहरणात्मक अनुमान है — किसी तीसरे-पक्ष टूल का माप नहीं।',
		},
		baseline: 'mcp-vertex के बिना (हाथ से · अनुमान)',
	},
	plugins: {
		title: 'प्लगइन',
		lead: 'प्रकाशित पैकेज। केवल जो चाहिए वही लोड करें; कोर छोटा रहता है।',
	},
	cfg: {
		title: 'सेटिंग्स',
		theme: 'थीम',
		language: 'भाषा',
		motion: 'एनिमेशन',
		motionLabel: 'मार्की को एनिमेट करें',
	},
	search: {
		title: 'खोजें',
		placeholder: 'साइट में खोजें...',
	},
	footer: {
		built: 'जीवित टूल रजिस्ट्री से जनित।',
		tagline: 'प्रोजेक्ट-अज्ञेयवादी MCP सर्वर कोर + प्लगइन लोडर।',
		sections: 'अनुभाग',
		resources: 'संसाधन',
		madeBy: 'Cartago द्वारा निर्मित · @CartagoGit GitHub पर',
		creatorsRepo: 'निर्माता GitHub पर',
		creatorsNpm: 'निर्माता npm पर',
	},
	pluginpage: {
		back: 'वापस',
		tools: 'टूल',
		install: 'इंस्टॉल',
		tabInstall: 'इंस्टॉल',
		tabTools: 'टूल',
		tabConfiguration: 'कॉन्फ़िगरेशन',
		tabTutorial: 'ट्यूटोरियल',
	},
	plugin: {
		proposals:
			'मल्टी-एजेंट समन्वय: लॉक, कार्य कतार, slices, round-context, स्थिति मरम्मत।',
		git: 'केवल-पढ़ने योग्य रिपॉजिटरी निरीक्षण: status, बदली फाइलें, diff, log।',
		memory: 'सत्रों के बीच टिकाऊ नोट्स, BM25 रिकॉल, कोटा, TTL और सीक्रेट रिडैक्शन के साथ।',
		search: 'कम-लागत workspace खोज: substring या regex, glob शामिल/बहिष्कृत।',
		rules: 'फ्रेमवर्क पहचान + lint/परंपरा मार्गदर्शन; प्रोजेक्ट कॉन्फ़िग प्राथमिकता।',
		quality:
			'गुणवत्ता गेट चलाएँ (lint/test/build) allow/deny नीति के साथ; रद्द करने योग्य।',
		docs: 'प्रोजेक्ट markdown दस्तावेज़ कैटलॉग करें और पढ़ें, कम-लागत क्यूरेटेड नेविगेशन।',
		deps: 'ऑफ़लाइन निर्भरता सूची + स्वास्थ्य (lockfile, ढीली रेंज, डुप्लिकेट)।',
		notification: 'लॉक-रिलीज़ इवेंट पुश करता है ताकि एजेंट पोलिंग बंद करें।',
		logs: 'Append-only redacted event log with query, tail and correlation tools.',
		'status-marker':
			'हर एजेंट उत्तर के लिए अनिवार्य रंगीन क्लोज़ मार्कर: 8 कैनोनिकल स्थितियाँ, helper + validator टूल।',
		core: 'निरपेक्ष कोर: overview, scaffold, मेट्रिक्स, doctor और प्लगइन लोडर।',
		issues: {
			description:
				'GitHub issues plugin — ingest, analyse and (optionally) promote to a proposal.',
			requires: 'requires',
			installSnippet: 'mcp-vertex --plugins=proposals,issues',
		},
	},
	toolpage: {
		back: 'वापस',
		backToPlugin: 'प्लगइन पर वापस',
		arguments: 'तर्क',
		argName: 'तर्क',
		argType: 'प्रकार',
		argRequired: 'आवश्यक',
		argDescription: 'विवरण',
		argRequiredYes: 'हाँ',
		argRequiredNo: 'नहीं',
		noArguments: 'यह टूल कोई तर्क नहीं लेता।',
		effects: 'प्रभाव',
		effectReadOnly: 'केवल-पढ़ें',
		example: 'उदाहरण कॉल',
		exampleNote:
			'एक सामान्य MCP टूल-कॉल पेलोड के रूप में दिखाया गया; सटीक ट्रांसपोर्ट आपके क्लाइंट पर निर्भर करता है।',
		plugin: 'प्लगइन',
	},
	firstFiveMinutes: {
		title: 'पहले 5 मिनट',
		lead: 'कॉपी-पेस्ट करने योग्य तीन क्विकस्टार्ट। वह चुनें जो आपके mcp-vertex चलाने के तरीके से मेल खाता है।',
		profileTabBunNode: 'Bun / Node',
		profileTabVscode: 'VS Code / Copilot',
		profileTabClaude: 'Claude Code',
		bunNode: {
			title: 'Bun / Node — सर्वर सीधे चलाएँ',
			intro: 'किसी एडिटर इंटीग्रेशन की आवश्यकता नहीं: टर्मिनल से host server चलाएँ और किसी भी MCP क्लाइंट को उसके stdio ट्रांसपोर्ट की ओर इंगित करें।',
			steps: [
				'इंस्टॉल करें: `bun add @mcp-vertex/core` (या `npm install @mcp-vertex/core`)।',
				'चलाएँ: `bunx mcp-vertex --preset=standard` (या `npx mcp-vertex --preset=standard`)।',
				'जाँचें: प्रोसेस लोड किए गए प्लगइन की सूची प्रिंट करता है और stdio पर प्रतीक्षा करता है — रोकने के लिए Ctrl+C।',
				'अपने MCP क्लाइंट कॉन्फ़िग को `--preset=minimal|standard|swarm|full` के साथ बाइनरी पर इंगित करें (पूरी फ्लैग सूची के लिए इंस्टॉल देखें)।',
				'पहले `mcp-vertex_overview { compact: true }` कॉल करें — यह बताता है कि आगे क्या करना है।',
			],
		},
		vscode: {
			title: 'VS Code / GitHub Copilot',
			intro: 'एक-कमांड इंस्टॉलर VS Code का पता लगाता है और मौजूदा सर्वरों को छुए बिना mcp-vertex को आपकी MCP सर्वर सूची में जोड़ता है।',
			steps: [
				'इंस्टॉल पेज से एक-कमांड इंस्टॉलर चलाएँ (आपके IDE का स्वतः पता लगाता है)।',
				'विंडो रीलोड करें (`Developer: Reload Window`) ताकि Copilot नए सर्वर को पहचान सके।',
				'Copilot चैट पैनल खोलें और एजेंट पिकर में `mcp-vertex` एजेंट चुनें।',
				'उससे `mcp-vertex_overview` कॉल करने को कहें — इसे लोड किए गए प्रीसेट और एक अनुशंसित अगला कदम रिपोर्ट करना चाहिए।',
				'यदि सर्वर दिखाई नहीं देता, तो समस्या निवारण → "MCP server not detected" देखें।',
			],
		},
		claude: {
			title: 'Claude Code',
			intro: 'Claude Code workspace रूट पर `.mcp.json` पढ़ता है; इंस्टॉलर आपके लिए वह फ़ाइल लिखता या मर्ज करता है।',
			steps: [
				'एक-कमांड इंस्टॉलर चलाएँ — यह Claude Code का पता लगाता है और `.mcp.json` लिखता है।',
				'Claude Code को रीस्टार्ट करें (या सर्वर रीलोड करने के लिए `/mcp` चलाएँ) ताकि नई प्रविष्टि पहचानी जाए।',
				'एक नए सत्र में, हमेशा लोड होने वाली `AGENTS.md` + `CLAUDE.md` पहले से ही पहली कॉल के रूप में `mcp-vertex_overview` की ओर इंगित करती हैं।',
				'`mcp-vertex_overview { compact: true }` से पुष्टि करें — `recommendedNextAction` फ़ील्ड बताता है कि आगे क्या करना है।',
				'मल्टी-एजेंट सत्रों के लिए, slice claim करने से पहले `mcp-vertex-proposal-swarm-runner` स्किल पढ़ें।',
			],
		},
		nextSteps: 'आगे कहाँ जाएँ',
		nextToolsCta: 'सभी टूल देखें',
		nextTroubleshootingCta: 'कुछ काम नहीं कर रहा? समस्या निवारण',
	},
	troubleshooting: {
		title: 'समस्या निवारण',
		lead: 'लक्षण → संभावित कारण → समाधान, उन समस्याओं के लिए जो वास्तव में रिपोर्ट की गई हैं।',
		symptom: 'लक्षण',
		cause: 'संभावित कारण',
		fix: 'समाधान',
		tags: 'टैग',
		backToIndex: 'समस्या निवारण पर वापस',
		closedBy: 'द्वारा बंद किया गया',
		empty: 'अभी इस फ़िल्टर से कोई समस्या निवारण मामला मेल नहीं खाता।',
	},
	knowledge: {
		title: 'ज्ञान',
		lead: 'सूचीबद्ध दस्तावेज़ जिन पर कोर प्रश्नों का उत्तर दे सकता है।',
		count: 'दस्तावेज़',
	},
	prompts: {
		title: 'प्रॉम्प्ट',
		lead: 'कोर द्वारा प्रदान किए गए पुनः उपयोग योग्य प्रॉम्प्ट टेम्पलेट।',
		count: 'प्रॉम्प्ट',
		arg: 'तर्क',
	},
	resources: {
		title: 'संसाधन',
		lead: 'प्रोजेक्ट के साथ बंडल किए गए स्थिर संसाधन (URI + MIME)।',
		count: 'संसाधन',
		uri: 'URI',
		mime: 'MIME',
	},
	skills: {
		title: 'कौशल',
		lead: 'डोमेन प्लेबुक जिन्हें एजेंट माँग पर लोड कर सकता है।',
		count: 'कौशल',
		body: 'मुख्य भाग',
	},
	notFound: {
		code: '404',
		title: 'पृष्ठ नहीं मिला',
		lead: 'जिस पृष्ठ को आप खोज रहे हैं वह मौजूद नहीं है या स्थानांतरित हो गया है। कोर निरपेक्ष रहता है — टूटे URL के प्रति भी।',
		homeCta: 'होम पर वापस',
		toolsCta: 'टूल देखें',
		homeAria: 'होम पर जाएँ',
	},
	proposals: proposalGlossaryByLang.hi,
	recovery: recoveryByLang.hi,
	logs: logsByLang.hi,
	presets: {
		title: 'प्रीसेट्स',
		lead: 'विभिन्न कार्यस्थान आकारों के लिए पूर्व-कॉन्फ़िगर किए गए प्लगइन सेट।',
		summary: 'इस रिपॉजिटरी में प्रीसेट में {count} अद्वितीय प्लगइन शामिल हैं।',
		hostOnlyChip: 'केवल होस्ट',
		installTitle: 'कैसे उपयोग करें',
		installLead: 'MCP सर्वर शुरू करते समय --preset ध्वज निर्दिष्ट करें।',
		table: {
			preset: 'प्रीसेट',
		},
	},
	setup: {
		title: 'क्रॉस-प्रोजेक्ट सेटअप',
		lead: 'mcp-vertex को किसी भी रिपॉज़िटरी में जोड़ें और उस रिपॉज़िटरी के लिए GitHub issues प्लगइन तैयार करें — वही 7 चरण जो setup-github कमांड चलाता है।',
		stepsTitle: '7 चरण',
		docsLinkLabel: 'क्रॉस-प्रोजेक्ट सेटअप की आधिकारिक गाइड पढ़ें',
		detectRepoTitle: 'रिपॉज़िटरी पहचानें',
		detectRepoBody:
			'GitHub रिमोट पढ़कर उसे owner/name में सामान्यीकृत करता है। पहचाना गया स्लग आपकी अपेक्षित रिपॉज़िटरी की ओर इंगित करना चाहिए।',
		confirmRepoTitle: 'owner/name की पुष्टि करें',
		confirmRepoBody:
			'सेटअप कमांड चलाएँ और कुछ भी लिखने से पहले पहचाने गए स्लग की पुष्टि करें (या बदलें)।',
		pickAuthTierTitle: 'प्रमाणीकरण स्तर चुनें',
		pickAuthTierBody:
			'जब gh auth status सफल हो तो gh, जब GITHUB_TOKEN सेट हो तो rest-authed, अन्यथा rest-anon (प्रति घंटे 60 अनुरोध तक सीमित) का उपयोग करें।',
		writeConfigTitle: 'कॉन्फ़िग लिखें',
		writeConfigBody:
			'plugins.issues.options.repo को mcp-vertex.config.json में लिखता है, अन्य प्लगइन सेटिंग्स को छुए बिना।',
		verifyTierTitle: 'स्तर सत्यापित करें',
		verifyTierBody:
			'issues प्लगइन लोड करके होस्ट शुरू करें ताकि चुना गया प्रमाणीकरण स्तर एंड-टू-एंड परखा जा सके।',
		printInvocationTitle: 'इन्वोकेशन प्रिंट करें',
		printInvocationBody:
			'यह सर्वर ब्लॉक अपने mcp.json में जोड़ें। यह रूप VS Code, Cursor और Claude Code में एक समान है।',
		markConfiguredTitle: 'कॉन्फ़िगर किया गया चिह्नित करें',
		markConfiguredBody:
			'वैकल्पिक रूप से दर्ज करें कि यह रिपॉज़िटरी एक बार कॉन्फ़िगर हो चुकी है, ताकि बाद के रन प्रॉम्प्ट छोड़ दें।',
		optionalLabel: 'वैकल्पिक',
	},
	ui: {
		codeCopy: 'कॉपी',
		codeCopied: 'कॉपी हो गया!',
		codeCollapse: 'संकुचित',
		codeExpand: 'विस्तार',
		calloutNote: 'नोट',
		calloutTip: 'सुझाव',
		calloutWarn: 'चेतावनी',
		calloutDanger: 'ख़तरा',
		tabsNext: 'अगला',
		tabsPrev: 'पिछला',
		stepsOf: 'में से',
	},

	homeQuickInstall: {
		title: 'त्वरित इंस्टॉल',
		lead: 'अपना पैकेज मैनेजर चुनें। वही कमांड Node, Deno और Bun के साथ काम करता है — बाकी सब इंस्टॉल पेज पर है।',
		tabsLabel: 'पैकेज मैनेजर',
		pms: [
			{ id: 'npm', note: 'Node Package Manager — Node.js के साथ आता है।' },
			{ id: 'pnpm', note: 'तेज़, डिस्क-कुशल, सख्त निर्भरता रिज़ॉल्यूशन।' },
			{ id: 'yarn', note: 'npm का क्लासिक विकल्प।' },
			{
				id: 'bun',
				note: 'ऑल-इन-वन रनटाइम + पैकेज मैनेजर — mcp-vertex खुद bun से बना है।',
			},
			{
				id: 'deno',
				note: 'पहले-दर्ज़े के TypeScript के साथ डिफ़ॉल्ट-रूप से सुरक्षित रनटाइम।',
			},
		],
		recommended: 'अनुशंसित',
		fullCta: 'पूर्ण इंस्टॉल मैट्रिक्स',
	},
	homeAtAGlance: {
		title: 'यह क्या कर सकता है?',
		lead: 'एक अनुभाग चुनें। होम पेज़ केवल दिशा देता है — हर प्रवेश-बिंदु की पूरी कहानी अपने पेज़ पर है।',
		tabsLabel: 'अनुभाग',
		openSection: 'खोलें',
		panels: [
			{
				id: 'plugins',
				label: 'प्लगइन्स',
				summary:
					'प्रकाशित पैकेज। बस जितना चाहिए उतना लोड करें; कोर छोटा रहता है।',
				href: 'plugins',
			},
			{
				id: 'tools',
				label: 'टूल',
				summary:
					'पूर्ण प्लगइन सेट द्वारा उजागर हर टूल, namespace के अनुसार — जीवित रजिस्ट्री से।',
				href: 'tools',
			},
			{
				id: 'bench',
				label: 'बेंचमार्क',
				summary:
					'टोकन दक्षता एक संरक्षित अपरिवर्तनीय है — मापी गई, दावा नहीं।',
				href: 'benchmarks',
			},
			{
				id: 'skills',
				label: 'स्किल्स',
				summary: 'डोमेन प्लेबुक जिन्हें एजेंट माँग पर लोड कर सकता है।',
				href: 'skills',
			},
			{
				id: 'knowledge',
				label: 'ज्ञान',
				summary: 'सूचीबद्ध दस्तावेज़ जिन पर कोर प्रश्नों का उत्तर दे सकता है।',
				href: 'knowledge',
			},
			{
				id: 'presets',
				label: 'प्रीसेट्स',
				summary: 'किसी भी वर्कस्पेस आकार के लिए पूर्व-कॉन्फ़िगर प्लगइन सेट।',
				href: 'presets',
			},
			{
				id: 'setup',
				label: 'क्रॉस-प्रोजेक्ट सेटअप',
				summary:
					'mcp-vertex को किसी भी रेपो में जोड़ें और issues प्लगइन तैयार करें।',
				href: 'setup',
			},
		],
	},
};

export default dict;
