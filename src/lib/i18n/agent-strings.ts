/**
 * Translated UI strings for the agent panel and proactive guide.
 * Keyed by language code (ISO 639-1). Falls back to English.
 */

export interface AgentStrings {
  // Proactive guide
  workingOn: string;
  chapters: string;
  noFingerprint: string;
  noStoryBible: string;
  noArchitecture: string;
  pendingFindings: string;
  setupProgress: string;
  alsoRecommended: string;
  runAllSetup: string;
  agents: string;
  browseAll: string;

  // Panel header & status
  writingAgent: string;
  running: string;
  completed: string;
  failed: string;
  suggestedNext: string;
  startNewWorkflow: string;

  // Thinking & tool status
  agentThinking: string;
  approved: string;
  rejected: string;
  modified: string;
  agentStarted: string;

  // Session results
  sessionComplete: string;
  findingsCreated: string;
  statusAdvanced: string;
  betaGate: string;
  betaPassed: string;
  betaNearMiss: string;
  betaFailed: string;
  recommendedNext: string;

  // Series-related
  seriesContext: string;
  seriesDocsGenerating: string;
  crossBookContinuity: string;
  seriesStats: string;

  // Greenfield onboarding
  greenfieldWelcome: string;
  greenfieldPlaceholder: string;
  greenfieldDivider: string;
  greenfieldNewNovel: string;
  greenfieldNewNovelDesc: string;
  greenfieldExistingMs: string;
  greenfieldExistingMsDesc: string;

  // Workflow labels (overrides for common workflows)
  workflows: Record<string, string>;
  // Workflow writer-facing descriptions
  workflowDescriptions: Record<string, string>;
}

const EN: AgentStrings = {
  workingOn: "Working on",
  chapters: "chapters",
  noFingerprint: "no style fingerprint",
  noStoryBible: "no story bible",
  noArchitecture: "no architecture",
  pendingFindings: "pending findings",
  setupProgress: "Setup progress",
  alsoRecommended: "Also recommended:",
  runAllSetup: "Run all setup steps",
  agents: "agents",
  browseAll: "Browse all workflows",
  greenfieldWelcome: "Hi! Tell me about the book you want to write. What's the story about? I'll help you get started.",
  greenfieldPlaceholder: "Tell me about your book...",
  greenfieldDivider: "or choose a path",
  greenfieldNewNovel: "New Novel",
  greenfieldNewNovelDesc: "Start from scratch — concept, style, story bible, architecture.",
  greenfieldExistingMs: "Existing Manuscript",
  greenfieldExistingMsDesc: "Import, analyze, then edit and polish.",
  writingAgent: "Writing Agent",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  suggestedNext: "Suggested next:",
  startNewWorkflow: "Start new workflow",
  agentThinking: "Agent is thinking",
  approved: "Approved",
  rejected: "Rejected",
  modified: "Modified",
  agentStarted: "Agent Started — see panel",
  sessionComplete: "Session Complete",
  findingsCreated: "findings",
  statusAdvanced: "Status",
  betaGate: "Beta Gate",
  betaPassed: "Passed",
  betaNearMiss: "Near Miss",
  betaFailed: "Needs Revision",
  recommendedNext: "Recommended next:",
  seriesContext: "This book is part of the series: {seriesName}",
  seriesDocsGenerating: "Series documents will be generated when 2+ books have foundational documents",
  crossBookContinuity: "Cross-Book Continuity Check",
  seriesStats: "Series Statistics",
  workflows: {
    "read-manuscript": "Import Manuscript",
    "capture-style": "Capture Style",
    "create-story-bible": "Create Story Bible",
    "build-architecture": "Build Architecture",
    "new-novel": "New Novel Setup",
    "dev-edit": "Developmental Edit",
    "line-edit": "Line Edit",
    "beta-read": "Beta Read",
    "write-chapter": "Write Chapter",
    "plan-chapter": "Plan Chapter",
    "discuss-chapter": "Discuss Chapter",
    "discuss-edits": "Discuss Edits",
    "publishing-check": "Publishing Check",
    "market-analysis": "Market Analysis",
    "refresh-style": "Refresh Style",
    "evolve-style": "Evolve Style",
    "check-series-continuity": "Cross-Book Continuity Check",
    coach: "Writing Coach",
    freewrite: "Freewrite",
    revise: "Revise Chapter",
    analyze: "Analyze Manuscript",
  },
  workflowDescriptions: {
    "capture-style": "Analyze your writing to capture your unique voice.",
    "create-story-bible": "Build your story bible — characters, world, rules, and themes.",
    "build-architecture": "Design your story structure — acts, chapters, and pacing.",
    "new-novel": "Start a new novel — define your premise, characters, and themes.",
    "dev-edit": "Deep structural edit — checks pacing, arcs, and tension.",
    "line-edit": "Prose polish — catches weak language and AI tells.",
    "beta-read": "Get feedback from a simulated panel of diverse readers.",
    "write-chapter": "Write a chapter draft in your voice using the plan.",
    "plan-chapter": "Create a detailed beat sheet and scene plan for a chapter.",
    "discuss-chapter": "Discuss a chapter's direction before writing it.",
    "discuss-edits": "Review and discuss edit findings before applying them.",
    revise: "Revise the chapter based on editing feedback.",
    coach: "Talk to your writing coach about anything — craft, story, or process.",
    freewrite: "Write freely — explore ideas without a plan.",
    analyze: "Get statistics and readability metrics for your manuscript.",
  },
};

const SR: AgentStrings = {
  workingOn: "Radite na",
  chapters: "poglavlja",
  noFingerprint: "nema stilskog otiska",
  noStoryBible: "nema biblije priče",
  noArchitecture: "nema arhitekture",
  pendingFindings: "pronalazaka na čekanju",
  setupProgress: "Napredak podešavanja",
  alsoRecommended: "Takođe preporučeno:",
  runAllSetup: "Pokreni sve korake podešavanja",
  agents: "agenata",
  browseAll: "Pregledaj sve tokove rada",
  greenfieldWelcome: "Zdravo! Recite mi o knjizi koju želite da napišete. O čemu je priča? Pomoći ću vam da počnete.",
  greenfieldPlaceholder: "Recite mi o vašoj knjizi...",
  greenfieldDivider: "ili izaberite put",
  greenfieldNewNovel: "Novi roman",
  greenfieldNewNovelDesc: "Krenite od nule — koncept, stil, biblija priče, arhitektura.",
  greenfieldExistingMs: "Postojeći rukopis",
  greenfieldExistingMsDesc: "Uvezite, analizirajte, pa uredite i doradite.",
  writingAgent: "Agent za pisanje",
  running: "U toku",
  completed: "Završeno",
  failed: "Neuspelo",
  suggestedNext: "Predlog za sledeće:",
  startNewWorkflow: "Pokreni novi tok rada",
  agentThinking: "Agent razmišlja",
  approved: "Odobreno",
  rejected: "Odbijeno",
  modified: "Izmenjeno",
  agentStarted: "Agent pokrenut — pogledajte panel",
  sessionComplete: "Sesija završena",
  findingsCreated: "pronalazaka",
  statusAdvanced: "Status",
  betaGate: "Beta kapija",
  betaPassed: "Položeno",
  betaNearMiss: "Skoro položeno",
  betaFailed: "Potrebna revizija",
  recommendedNext: "Preporučeni sledeći korak:",
  seriesContext: "Ova knjiga je deo serijala: {seriesName}",
  seriesDocsGenerating: "Dokumenti serijala se generišu kada 2+ knjige imaju osnovne dokumente",
  crossBookContinuity: "Provera kontinuiteta između knjiga",
  seriesStats: "Statistika serijala",
  workflows: {
    "read-manuscript": "Uvezi rukopis",
    "capture-style": "Uhvati stil",
    "create-story-bible": "Kreiraj bibliju priče",
    "build-architecture": "Napravi arhitekturu",
    "new-novel": "Novi roman",
    "dev-edit": "Razvojna redakcija",
    "line-edit": "Jezička redakcija",
    "beta-read": "Beta čitanje",
    "write-chapter": "Napiši poglavlje",
    "plan-chapter": "Planiraj poglavlje",
    "discuss-chapter": "Diskutuj poglavlje",
    "discuss-edits": "Diskutuj izmene",
    "publishing-check": "Provera za izdavanje",
    "market-analysis": "Analiza tržišta",
    "refresh-style": "Osvježi stil",
    "evolve-style": "Razvij stil",
    "check-series-continuity": "Provera kontinuiteta između knjiga",
    coach: "Trener za pisanje",
    freewrite: "Slobodno pisanje",
    revise: "Revidiraj poglavlje",
    analyze: "Analiziraj rukopis",
  },
  workflowDescriptions: {
    "capture-style": "Analiziraj vaše pisanje da uhvati vaš jedinstveni glas.",
    "create-story-bible": "Napravite bibliju priče — likovi, svet, pravila i teme.",
    "build-architecture": "Dizajnirajte strukturu priče — činovi, poglavlja i tempo.",
    "new-novel": "Započnite novi roman — definišite premisu, likove i teme.",
    "dev-edit": "Duboka strukturna redakcija — proverava tempo, lukove i tenziju.",
    "line-edit": "Poliranje proze — otkriva slab jezik i AI obrasce.",
    "beta-read": "Dobijte povratne informacije od simuliranog panela raznovrsnih čitalaca.",
    "write-chapter": "Napišite nacrt poglavlja u vašem glasu koristeći plan.",
    "plan-chapter": "Napravite detaljan plan scena za poglavlje.",
    "discuss-chapter": "Diskutujte o pravcu poglavlja pre pisanja.",
    "discuss-edits": "Pregledajte i diskutujte o nalazima redakcije pre primene.",
    revise: "Revidirajte poglavlje na osnovu povratnih informacija.",
    coach: "Razgovarajte sa trenerom o bilo čemu — zanatu, priči ili procesu.",
    freewrite: "Pišite slobodno — istražujte ideje bez plana.",
    analyze: "Dobijte statistiku i metrike čitljivosti za vaš rukopis.",
  },
};

const DE: AgentStrings = {
  workingOn: "Arbeiten an",
  chapters: "Kapitel",
  noFingerprint: "kein Stil-Fingerabdruck",
  noStoryBible: "keine Story-Bibel",
  noArchitecture: "keine Architektur",
  pendingFindings: "ausstehende Befunde",
  setupProgress: "Setup-Fortschritt",
  alsoRecommended: "Auch empfohlen:",
  runAllSetup: "Alle Setup-Schritte ausführen",
  agents: "Agenten",
  browseAll: "Alle Workflows durchsuchen",
  greenfieldWelcome: "Hallo! Erzählen Sie mir von dem Buch, das Sie schreiben möchten. Worum geht es? Ich helfe Ihnen beim Einstieg.",
  greenfieldPlaceholder: "Erzählen Sie mir von Ihrem Buch...",
  greenfieldDivider: "oder wählen Sie einen Weg",
  greenfieldNewNovel: "Neuer Roman",
  greenfieldNewNovelDesc: "Von Grund auf — Konzept, Stil, Story-Bibel, Architektur.",
  greenfieldExistingMs: "Vorhandenes Manuskript",
  greenfieldExistingMsDesc: "Importieren, analysieren, dann bearbeiten und polieren.",
  writingAgent: "Schreib-Agent",
  running: "Läuft",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen",
  suggestedNext: "Vorschlag:",
  startNewWorkflow: "Neuen Workflow starten",
  agentThinking: "Agent denkt nach",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
  modified: "Geändert",
  agentStarted: "Agent gestartet — siehe Panel",
  sessionComplete: "Sitzung abgeschlossen",
  findingsCreated: "Befunde",
  statusAdvanced: "Status",
  betaGate: "Beta-Prüfung",
  betaPassed: "Bestanden",
  betaNearMiss: "Knapp verfehlt",
  betaFailed: "Überarbeitung nötig",
  recommendedNext: "Empfohlener nächster Schritt:",
  seriesContext: "Dieses Buch gehört zur Serie: {seriesName}",
  seriesDocsGenerating: "Seriendokumente werden generiert, wenn 2+ Bücher Basisdokumente haben",
  crossBookContinuity: "Buchübergreifende Kontinuitätsprüfung",
  seriesStats: "Serienstatistiken",
  workflows: {
    "read-manuscript": "Manuskript importieren",
    "capture-style": "Stil erfassen",
    "create-story-bible": "Story-Bibel erstellen",
    "build-architecture": "Architektur aufbauen",
    "dev-edit": "Strukturelles Lektorat",
    "line-edit": "Zeilenlektorat",
    "beta-read": "Beta-Lesung",
    "write-chapter": "Kapitel schreiben",
    "plan-chapter": "Kapitel planen",
  },
  workflowDescriptions: {},
};

const ES: AgentStrings = {
  workingOn: "Trabajando en",
  chapters: "capítulos",
  noFingerprint: "sin huella de estilo",
  noStoryBible: "sin biblia de la historia",
  noArchitecture: "sin arquitectura",
  pendingFindings: "hallazgos pendientes",
  setupProgress: "Progreso de configuración",
  alsoRecommended: "También recomendado:",
  runAllSetup: "Ejecutar todos los pasos de configuración",
  agents: "agentes",
  browseAll: "Ver todos los flujos de trabajo",
  greenfieldWelcome: "¡Hola! Cuéntame sobre el libro que quieres escribir. ¿De qué trata la historia? Te ayudaré a empezar.",
  greenfieldPlaceholder: "Cuéntame sobre tu libro...",
  greenfieldDivider: "o elige un camino",
  greenfieldNewNovel: "Nueva novela",
  greenfieldNewNovelDesc: "Desde cero — concepto, estilo, biblia de la historia, arquitectura.",
  greenfieldExistingMs: "Manuscrito existente",
  greenfieldExistingMsDesc: "Importar, analizar, luego editar y pulir.",
  writingAgent: "Agente de escritura",
  running: "En ejecución",
  completed: "Completado",
  failed: "Fallido",
  suggestedNext: "Sugerencia:",
  startNewWorkflow: "Iniciar nuevo flujo de trabajo",
  agentThinking: "El agente está pensando",
  approved: "Aprobado",
  rejected: "Rechazado",
  modified: "Modificado",
  agentStarted: "Agente iniciado — ver panel",
  sessionComplete: "Sesión completada",
  findingsCreated: "hallazgos",
  statusAdvanced: "Estado",
  betaGate: "Puerta beta",
  betaPassed: "Aprobado",
  betaNearMiss: "Casi aprobado",
  betaFailed: "Necesita revisión",
  recommendedNext: "Siguiente recomendado:",
  seriesContext: "Este libro es parte de la serie: {seriesName}",
  seriesDocsGenerating: "Los documentos de serie se generan cuando 2+ libros tienen documentos base",
  crossBookContinuity: "Verificación de continuidad entre libros",
  seriesStats: "Estadísticas de serie",
  workflows: {
    "read-manuscript": "Importar manuscrito",
    "capture-style": "Capturar estilo",
    "create-story-bible": "Crear biblia de la historia",
    "build-architecture": "Construir arquitectura",
    "dev-edit": "Edición de desarrollo",
    "line-edit": "Edición de línea",
    "beta-read": "Lectura beta",
    "write-chapter": "Escribir capítulo",
    "plan-chapter": "Planificar capítulo",
  },
  workflowDescriptions: {},
};

const FR: AgentStrings = {
  workingOn: "Travail sur",
  chapters: "chapitres",
  noFingerprint: "pas d'empreinte de style",
  noStoryBible: "pas de bible de l'histoire",
  noArchitecture: "pas d'architecture",
  pendingFindings: "résultats en attente",
  setupProgress: "Progression de la configuration",
  alsoRecommended: "Également recommandé :",
  runAllSetup: "Exécuter toutes les étapes de configuration",
  agents: "agents",
  browseAll: "Parcourir tous les flux de travail",
  greenfieldWelcome: "Bonjour ! Parlez-moi du livre que vous souhaitez écrire. De quoi parle l'histoire ? Je vous aiderai à démarrer.",
  greenfieldPlaceholder: "Parlez-moi de votre livre...",
  greenfieldDivider: "ou choisissez un chemin",
  greenfieldNewNovel: "Nouveau roman",
  greenfieldNewNovelDesc: "Partir de zéro — concept, style, bible de l'histoire, architecture.",
  greenfieldExistingMs: "Manuscrit existant",
  greenfieldExistingMsDesc: "Importer, analyser, puis éditer et peaufiner.",
  writingAgent: "Agent d'écriture",
  running: "En cours",
  completed: "Terminé",
  failed: "Échoué",
  suggestedNext: "Suggestion :",
  startNewWorkflow: "Démarrer un nouveau flux de travail",
  agentThinking: "L'agent réfléchit",
  approved: "Approuvé",
  rejected: "Rejeté",
  modified: "Modifié",
  agentStarted: "Agent démarré — voir le panneau",
  sessionComplete: "Session terminée",
  findingsCreated: "résultats",
  statusAdvanced: "Statut",
  betaGate: "Porte bêta",
  betaPassed: "Réussi",
  betaNearMiss: "Presque réussi",
  betaFailed: "Révision nécessaire",
  recommendedNext: "Prochaine étape recommandée :",
  seriesContext: "Ce livre fait partie de la série : {seriesName}",
  seriesDocsGenerating: "Les documents de série seront générés lorsque 2+ livres auront des documents de base",
  crossBookContinuity: "Vérification de la continuité inter-livres",
  seriesStats: "Statistiques de série",
  workflows: {
    "read-manuscript": "Importer le manuscrit",
    "capture-style": "Capturer le style",
    "create-story-bible": "Créer la bible de l'histoire",
    "build-architecture": "Construire l'architecture",
    "dev-edit": "Révision structurelle",
    "line-edit": "Révision stylistique",
    "beta-read": "Lecture bêta",
    "write-chapter": "Écrire un chapitre",
    "plan-chapter": "Planifier un chapitre",
  },
  workflowDescriptions: {},
};

const RU: AgentStrings = {
  workingOn: "Работа над",
  chapters: "глав",
  noFingerprint: "нет стилевого отпечатка",
  noStoryBible: "нет библии истории",
  noArchitecture: "нет архитектуры",
  pendingFindings: "ожидающих замечаний",
  setupProgress: "Прогресс настройки",
  alsoRecommended: "Также рекомендуется:",
  runAllSetup: "Запустить все шаги настройки",
  agents: "агентов",
  browseAll: "Просмотреть все рабочие процессы",
  greenfieldWelcome: "Привет! Расскажите мне о книге, которую хотите написать. О чём история? Я помогу вам начать.",
  greenfieldPlaceholder: "Расскажите о вашей книге...",
  greenfieldDivider: "или выберите путь",
  greenfieldNewNovel: "Новый роман",
  greenfieldNewNovelDesc: "С нуля — концепция, стиль, библия истории, архитектура.",
  greenfieldExistingMs: "Существующая рукопись",
  greenfieldExistingMsDesc: "Импорт, анализ, затем редактура и полировка.",
  writingAgent: "Агент-писатель",
  running: "Выполняется",
  completed: "Завершено",
  failed: "Ошибка",
  suggestedNext: "Следующий шаг:",
  startNewWorkflow: "Начать новый процесс",
  agentThinking: "Агент думает",
  approved: "Одобрено",
  rejected: "Отклонено",
  modified: "Изменено",
  agentStarted: "Агент запущен — см. панель",
  sessionComplete: "Сессия завершена",
  findingsCreated: "замечаний",
  statusAdvanced: "Статус",
  betaGate: "Бета-проверка",
  betaPassed: "Пройдено",
  betaNearMiss: "Почти пройдено",
  betaFailed: "Требуется доработка",
  recommendedNext: "Рекомендуемый следующий шаг:",
  seriesContext: "Эта книга является частью серии: {seriesName}",
  seriesDocsGenerating: "Документы серии будут созданы, когда 2+ книги будут иметь базовые документы",
  crossBookContinuity: "Проверка межкнижной целостности",
  seriesStats: "Статистика серии",
  workflows: {
    "read-manuscript": "Импорт рукописи",
    "capture-style": "Захват стиля",
    "create-story-bible": "Создать библию истории",
    "build-architecture": "Построить архитектуру",
    "dev-edit": "Структурная редактура",
    "line-edit": "Литературная редактура",
    "beta-read": "Бета-чтение",
    "write-chapter": "Написать главу",
    "plan-chapter": "Спланировать главу",
  },
  workflowDescriptions: {},
};

const ZH: AgentStrings = {
  workingOn: "正在处理",
  chapters: "章节",
  noFingerprint: "无风格指纹",
  noStoryBible: "无故事圣经",
  noArchitecture: "无架构",
  pendingFindings: "待处理发现",
  setupProgress: "设置进度",
  alsoRecommended: "同时推荐：",
  runAllSetup: "运行所有设置步骤",
  agents: "个代理",
  browseAll: "浏览所有工作流",
  greenfieldWelcome: "你好！告诉我你想写什么书。故事是关于什么的？我会帮助你开始。",
  greenfieldPlaceholder: "告诉我关于你的书...",
  greenfieldDivider: "或选择一条路径",
  greenfieldNewNovel: "新小说",
  greenfieldNewNovelDesc: "从零开始——概念、风格、故事圣经、架构。",
  greenfieldExistingMs: "现有手稿",
  greenfieldExistingMsDesc: "导入、分析，然后编辑和润色。",
  writingAgent: "写作代理",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  suggestedNext: "下一步建议：",
  startNewWorkflow: "开始新工作流",
  agentThinking: "代理正在思考",
  approved: "已批准",
  rejected: "已拒绝",
  modified: "已修改",
  agentStarted: "代理已启动 — 查看面板",
  sessionComplete: "会话完成",
  findingsCreated: "个发现",
  statusAdvanced: "状态",
  betaGate: "Beta检查",
  betaPassed: "通过",
  betaNearMiss: "接近通过",
  betaFailed: "需要修改",
  recommendedNext: "推荐下一步：",
  seriesContext: "本书属于系列：{seriesName}",
  seriesDocsGenerating: "当2本以上书籍拥有基础文档时，将生成系列文档",
  crossBookContinuity: "跨书连续性检查",
  seriesStats: "系列统计",
  workflows: {
    "read-manuscript": "导入手稿",
    "capture-style": "捕获风格",
    "create-story-bible": "创建故事圣经",
    "build-architecture": "构建架构",
    "dev-edit": "结构性编辑",
    "line-edit": "行编辑",
    "beta-read": "Beta阅读",
    "write-chapter": "撰写章节",
    "plan-chapter": "规划章节",
  },
  workflowDescriptions: {},
};

const STRINGS: Record<string, AgentStrings> = {
  en: EN,
  sr: SR,
  de: DE,
  es: ES,
  fr: FR,
  ru: RU,
  zh: ZH,
};

/**
 * Get translated agent UI strings for a language code.
 * Falls back to English for unsupported languages.
 */
export function getAgentStrings(language: string): AgentStrings {
  // Try exact match, then base language (e.g., "zh-cn" -> "zh")
  return (
    STRINGS[language] ??
    STRINGS[language.split("-")[0]] ??
    EN
  );
}
