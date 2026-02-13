/**
 * Human-readable tool descriptions for the agent message stream.
 * Maps raw tool names + inputs to friendly labels for the UI.
 * Supports multi-language output.
 */

interface ToolInput {
  documentType?: string;
  chapterNumber?: number;
  [key: string]: unknown;
}

// ─── Document type labels per language ───────────────────────

const DOC_TYPE_LABELS: Record<string, Record<string, string>> = {
  en: {
    STORY_BIBLE: "Story Bible",
    ARCHITECTURE: "Architecture",
    FINGERPRINT: "Style Fingerprint",
    CHAPTER_CONTENT: "Chapter Content",
    CHAPTER_PLAN: "Chapter Plan",
    CHAPTER_BRIEF: "Chapter Brief",
    DEV_EDIT_REPORT: "Dev Edit Report",
    LINE_EDIT_REPORT: "Line Edit Report",
    BETA_READ_REPORT: "Beta Read Report",
    CONTINUITY_REPORT: "Continuity Report",
    ANALYSIS_REPORT: "Analysis Report",
    MARKET_REPORT: "Market Report",
    EXPORT_CONFIG: "Export Config",
    FREEWRITE: "Freewrite",
    SERIES_BIBLE: "Series Bible",
    SERIES_ARCHITECTURE: "Series Architecture",
    SERIES_CONTINUITY: "Series Continuity",
    SERIES_FINGERPRINT: "Series Fingerprint",
    KNOWLEDGE_LEDGER: "Knowledge Ledger",
  },
  sr: {
    STORY_BIBLE: "Biblija priče",
    ARCHITECTURE: "Arhitektura",
    FINGERPRINT: "Stilski otisak",
    CHAPTER_CONTENT: "Sadržaj poglavlja",
    CHAPTER_PLAN: "Plan poglavlja",
    CHAPTER_BRIEF: "Kratak opis poglavlja",
    DEV_EDIT_REPORT: "Izveštaj razvojne redakcije",
    LINE_EDIT_REPORT: "Izveštaj jezičke redakcije",
    BETA_READ_REPORT: "Izveštaj beta čitanja",
    CONTINUITY_REPORT: "Izveštaj kontinuiteta",
    ANALYSIS_REPORT: "Izveštaj analize",
    MARKET_REPORT: "Izveštaj tržišta",
    EXPORT_CONFIG: "Podešavanje izvoza",
    FREEWRITE: "Slobodno pisanje",
    SERIES_BIBLE: "Biblija serijala",
    SERIES_ARCHITECTURE: "Arhitektura serijala",
    SERIES_CONTINUITY: "Kontinuitet serijala",
    SERIES_FINGERPRINT: "Stilski otisak serijala",
    KNOWLEDGE_LEDGER: "Registar znanja",
  },
  de: {
    STORY_BIBLE: "Story-Bibel",
    ARCHITECTURE: "Architektur",
    FINGERPRINT: "Stil-Fingerabdruck",
    CHAPTER_CONTENT: "Kapitelinhalt",
    CHAPTER_PLAN: "Kapitelplan",
    CHAPTER_BRIEF: "Kapitelbriefing",
    DEV_EDIT_REPORT: "Strukturelles Lektorat",
    LINE_EDIT_REPORT: "Zeilenlektorat",
    BETA_READ_REPORT: "Beta-Lesung",
    CONTINUITY_REPORT: "Kontinuitätsbericht",
    ANALYSIS_REPORT: "Analysebericht",
    MARKET_REPORT: "Marktbericht",
    EXPORT_CONFIG: "Export-Konfiguration",
    FREEWRITE: "Freies Schreiben",
    SERIES_BIBLE: "Serien-Bibel",
    SERIES_ARCHITECTURE: "Serienarchitektur",
    SERIES_CONTINUITY: "Serienkontinuität",
    SERIES_FINGERPRINT: "Serien-Fingerabdruck",
    KNOWLEDGE_LEDGER: "Wissensregister",
  },
  es: {
    STORY_BIBLE: "Biblia de la historia",
    ARCHITECTURE: "Arquitectura",
    FINGERPRINT: "Huella de estilo",
    CHAPTER_CONTENT: "Contenido del capítulo",
    CHAPTER_PLAN: "Plan del capítulo",
    CHAPTER_BRIEF: "Resumen del capítulo",
    DEV_EDIT_REPORT: "Edición de desarrollo",
    LINE_EDIT_REPORT: "Edición de línea",
    BETA_READ_REPORT: "Lectura beta",
    CONTINUITY_REPORT: "Informe de continuidad",
    ANALYSIS_REPORT: "Informe de análisis",
    MARKET_REPORT: "Informe de mercado",
    EXPORT_CONFIG: "Configuración de exportación",
    FREEWRITE: "Escritura libre",
    SERIES_BIBLE: "Biblia de la serie",
    SERIES_ARCHITECTURE: "Arquitectura de la serie",
    SERIES_CONTINUITY: "Continuidad de la serie",
    SERIES_FINGERPRINT: "Huella de la serie",
    KNOWLEDGE_LEDGER: "Registro de conocimiento",
  },
  fr: {
    STORY_BIBLE: "Bible de l'histoire",
    ARCHITECTURE: "Architecture",
    FINGERPRINT: "Empreinte de style",
    CHAPTER_CONTENT: "Contenu du chapitre",
    CHAPTER_PLAN: "Plan du chapitre",
    CHAPTER_BRIEF: "Résumé du chapitre",
    DEV_EDIT_REPORT: "Révision structurelle",
    LINE_EDIT_REPORT: "Révision stylistique",
    BETA_READ_REPORT: "Lecture bêta",
    CONTINUITY_REPORT: "Rapport de continuité",
    ANALYSIS_REPORT: "Rapport d'analyse",
    MARKET_REPORT: "Rapport de marché",
    EXPORT_CONFIG: "Configuration d'export",
    FREEWRITE: "Écriture libre",
    SERIES_BIBLE: "Bible de la série",
    SERIES_ARCHITECTURE: "Architecture de la série",
    SERIES_CONTINUITY: "Continuité de la série",
    SERIES_FINGERPRINT: "Empreinte de la série",
    KNOWLEDGE_LEDGER: "Registre de connaissances",
  },
  ru: {
    STORY_BIBLE: "Библия истории",
    ARCHITECTURE: "Архитектура",
    FINGERPRINT: "Стилевой отпечаток",
    CHAPTER_CONTENT: "Содержание главы",
    CHAPTER_PLAN: "План главы",
    CHAPTER_BRIEF: "Краткое описание главы",
    DEV_EDIT_REPORT: "Структурная редактура",
    LINE_EDIT_REPORT: "Литературная редактура",
    BETA_READ_REPORT: "Бета-чтение",
    CONTINUITY_REPORT: "Отчёт о непрерывности",
    ANALYSIS_REPORT: "Аналитический отчёт",
    MARKET_REPORT: "Рыночный отчёт",
    EXPORT_CONFIG: "Настройки экспорта",
    FREEWRITE: "Свободное письмо",
    SERIES_BIBLE: "Библия серии",
    SERIES_ARCHITECTURE: "Архитектура серии",
    SERIES_CONTINUITY: "Непрерывность серии",
    SERIES_FINGERPRINT: "Стилевой отпечаток серии",
    KNOWLEDGE_LEDGER: "Реестр знаний",
  },
  zh: {
    STORY_BIBLE: "故事圣经",
    ARCHITECTURE: "架构",
    FINGERPRINT: "风格指纹",
    CHAPTER_CONTENT: "章节内容",
    CHAPTER_PLAN: "章节计划",
    CHAPTER_BRIEF: "章节简介",
    DEV_EDIT_REPORT: "结构性编辑报告",
    LINE_EDIT_REPORT: "行编辑报告",
    BETA_READ_REPORT: "Beta阅读报告",
    CONTINUITY_REPORT: "连续性报告",
    ANALYSIS_REPORT: "分析报告",
    MARKET_REPORT: "市场报告",
    EXPORT_CONFIG: "导出配置",
    FREEWRITE: "自由写作",
    SERIES_BIBLE: "系列圣经",
    SERIES_ARCHITECTURE: "系列架构",
    SERIES_CONTINUITY: "系列连续性",
    SERIES_FINGERPRINT: "系列风格指纹",
    KNOWLEDGE_LEDGER: "知识台账",
  },
};

function docLabel(type?: string, lang?: string): string {
  if (!type) {
    const defaults: Record<string, string> = {
      en: "document",
      sr: "dokument",
      de: "Dokument",
      es: "documento",
      fr: "document",
      ru: "документ",
      zh: "文档",
    };
    const l = lang && defaults[lang] ? lang : "en";
    return defaults[l];
  }
  const l = lang && DOC_TYPE_LABELS[lang] ? lang : "en";
  return DOC_TYPE_LABELS[l][type] ?? DOC_TYPE_LABELS.en[type] ?? type.replace(/_/g, " ").toLowerCase();
}

function chLabel(num?: number, lang?: string): string {
  if (!num) {
    const defaults: Record<string, string> = {
      en: "chapter",
      sr: "poglavlje",
      de: "Kapitel",
      es: "capítulo",
      fr: "chapitre",
      ru: "глава",
      zh: "章节",
    };
    const l = lang && defaults[lang] ? lang : "en";
    return defaults[l];
  }
  const templates: Record<string, (n: number) => string> = {
    en: (n) => `Chapter ${n}`,
    sr: (n) => `Poglavlje ${n}`,
    de: (n) => `Kapitel ${n}`,
    es: (n) => `Capítulo ${n}`,
    fr: (n) => `Chapitre ${n}`,
    ru: (n) => `Глава ${n}`,
    zh: (n) => `第${n}章`,
  };
  const l = lang && templates[lang] ? lang : "en";
  return templates[l](num);
}

// ─── Tool label templates per language ───────────────────────

type ToolLabelFn = (input: ToolInput, lang: string) => string;

const TOOL_LABELS: Record<string, ToolLabelFn> = {
  ReadDocument: (input, lang) => {
    const templates: Record<string, string> = {
      en: `Reading ${docLabel(input.documentType, lang)}...`,
      sr: `Čitanje: ${docLabel(input.documentType, lang)}...`,
      de: `Lese ${docLabel(input.documentType, lang)}...`,
      es: `Leyendo ${docLabel(input.documentType, lang)}...`,
      fr: `Lecture de ${docLabel(input.documentType, lang)}...`,
      ru: `Чтение: ${docLabel(input.documentType, lang)}...`,
      zh: `正在读取${docLabel(input.documentType, lang)}...`,
    };
    return templates[lang] ?? templates.en;
  },
  WriteDocument: (input, lang) => {
    const templates: Record<string, string> = {
      en: `Writing ${docLabel(input.documentType, lang)}...`,
      sr: `Pisanje: ${docLabel(input.documentType, lang)}...`,
      de: `Schreibe ${docLabel(input.documentType, lang)}...`,
      es: `Escribiendo ${docLabel(input.documentType, lang)}...`,
      fr: `Écriture de ${docLabel(input.documentType, lang)}...`,
      ru: `Запись: ${docLabel(input.documentType, lang)}...`,
      zh: `正在写入${docLabel(input.documentType, lang)}...`,
    };
    return templates[lang] ?? templates.en;
  },
  ReadChapter: (input, lang) => {
    const templates: Record<string, string> = {
      en: `Reading ${chLabel(input.chapterNumber, lang)}...`,
      sr: `Čitanje: ${chLabel(input.chapterNumber, lang)}...`,
      de: `Lese ${chLabel(input.chapterNumber, lang)}...`,
      es: `Leyendo ${chLabel(input.chapterNumber, lang)}...`,
      fr: `Lecture de ${chLabel(input.chapterNumber, lang)}...`,
      ru: `Чтение: ${chLabel(input.chapterNumber, lang)}...`,
      zh: `正在读取${chLabel(input.chapterNumber, lang)}...`,
    };
    return templates[lang] ?? templates.en;
  },
  WriteChapter: (input, lang) => {
    const templates: Record<string, string> = {
      en: `Writing ${chLabel(input.chapterNumber, lang)}...`,
      sr: `Pisanje: ${chLabel(input.chapterNumber, lang)}...`,
      de: `Schreibe ${chLabel(input.chapterNumber, lang)}...`,
      es: `Escribiendo ${chLabel(input.chapterNumber, lang)}...`,
      fr: `Écriture de ${chLabel(input.chapterNumber, lang)}...`,
      ru: `Запись: ${chLabel(input.chapterNumber, lang)}...`,
      zh: `正在写入${chLabel(input.chapterNumber, lang)}...`,
    };
    return templates[lang] ?? templates.en;
  },
  ListDocuments: (_input, lang) => {
    const templates: Record<string, string> = {
      en: "Checking existing documents...",
      sr: "Provera postojećih dokumenata...",
      de: "Prüfe vorhandene Dokumente...",
      es: "Verificando documentos existentes...",
      fr: "Vérification des documents existants...",
      ru: "Проверка существующих документов...",
      zh: "检查现有文档...",
    };
    return templates[lang] ?? templates.en;
  },
  CreateFinding: (input, lang) => {
    const ch = input.chapterNumber ? ` ${chLabel(input.chapterNumber, lang)}` : "";
    const templates: Record<string, string> = {
      en: `Creating finding${ch ? ` for ${ch}` : ""}...`,
      sr: `Kreiranje nalaza${ch ? ` za ${ch}` : ""}...`,
      de: `Erstelle Befund${ch ? ` für ${ch}` : ""}...`,
      es: `Creando hallazgo${ch ? ` para ${ch}` : ""}...`,
      fr: `Création d'un résultat${ch ? ` pour ${ch}` : ""}...`,
      ru: `Создание замечания${ch ? ` для ${ch}` : ""}...`,
      zh: `正在创建发现${ch ? `（${ch}）` : ""}...`,
    };
    return templates[lang] ?? templates.en;
  },
  RequestApproval: (_input, lang) => {
    const templates: Record<string, string> = {
      en: "Requesting your approval...",
      sr: "Traženje vašeg odobrenja...",
      de: "Bitte um Ihre Genehmigung...",
      es: "Solicitando su aprobación...",
      fr: "Demande d'approbation...",
      ru: "Запрос вашего одобрения...",
      zh: "请求您的批准...",
    };
    return templates[lang] ?? templates.en;
  },
  ReadSeriesDocument: (input, lang) => {
    const templates: Record<string, string> = {
      en: `Reading ${docLabel(input.documentType, lang)}...`,
      sr: `Čitanje: ${docLabel(input.documentType, lang)}...`,
      de: `Lese ${docLabel(input.documentType, lang)}...`,
      es: `Leyendo ${docLabel(input.documentType, lang)}...`,
      fr: `Lecture de ${docLabel(input.documentType, lang)}...`,
      ru: `Чтение: ${docLabel(input.documentType, lang)}...`,
      zh: `正在读取${docLabel(input.documentType, lang)}...`,
    };
    return templates[lang] ?? templates.en;
  },
  WriteSeriesDocument: (input, lang) => {
    const templates: Record<string, string> = {
      en: `Writing ${docLabel(input.documentType, lang)}...`,
      sr: `Pisanje: ${docLabel(input.documentType, lang)}...`,
      de: `Schreibe ${docLabel(input.documentType, lang)}...`,
      es: `Escribiendo ${docLabel(input.documentType, lang)}...`,
      fr: `Écriture de ${docLabel(input.documentType, lang)}...`,
      ru: `Запись: ${docLabel(input.documentType, lang)}...`,
      zh: `正在写入${docLabel(input.documentType, lang)}...`,
    };
    return templates[lang] ?? templates.en;
  },
};

/**
 * Get a human-readable label for a tool call.
 * Falls back to the raw tool name if no label is defined.
 * Accepts an optional language code for localization.
 */
export function getToolLabel(toolName: string, input?: ToolInput, language?: string): string {
  const lang = language ?? "en";
  const resolved = lang.split("-")[0]; // "zh-cn" → "zh"
  const fn = TOOL_LABELS[toolName];
  if (fn) return fn(input ?? {}, resolved);
  return toolName;
}

/**
 * Parse tool input from a message's content or metadata for interpolation.
 */
export function parseToolInput(message: {
  content: string;
  metadata?: Record<string, unknown>;
}): ToolInput | undefined {
  // First try metadata.toolInput
  if (message.metadata?.toolInput) {
    return message.metadata.toolInput as ToolInput;
  }
  // Try parsing content as JSON
  try {
    return JSON.parse(message.content) as ToolInput;
  } catch {
    return undefined;
  }
}
