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

  // Workflow labels (overrides for common workflows)
  workflows: Record<string, string>;
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
    coach: "Writing Coach",
    freewrite: "Freewrite",
    revise: "Revise Chapter",
    analyze: "Analyze Manuscript",
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
    coach: "Trener za pisanje",
    freewrite: "Slobodno pisanje",
    revise: "Revidiraj poglavlje",
    analyze: "Analiziraj rukopis",
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
