/**
 * Writer-facing names for the editorial vocabulary.
 *
 * EditFinding.category, .severity and .status are stored as slugs, and the UI
 * printed them raw: the category filter offered "show-tell" and "crutch-phrase"
 * and every card was badged "important" / "pending" on an otherwise Serbian
 * page (S3-23). The slugs stay the contract; these are only what the writer
 * reads.
 *
 * Kept beside tool-labels.ts rather than in ui-strings.ts: this is a map over
 * data values, not interface copy, and it grows whenever an agent learns a new
 * category.
 */

const CATEGORY_LABELS: Record<string, Record<string, string>> = {
  en: {
    "pacing": "Pacing",
    "dialogue": "Dialogue",
    "character": "Character",
    "plot": "Plot",
    "voice": "Voice",
    "prose": "Prose",
    "clarity": "Clarity",
    "redundancy": "Redundancy",
    "show-tell": "Show vs tell",
    "continuity": "Continuity",
    "emotion": "Emotion",
    "tension": "Tension",
    "stakes": "Stakes",
    "worldbuilding": "Worldbuilding",
    "crutch-phrase": "Crutch phrase",
    "ai-tell": "AI tell",
    "sentence-variety": "Sentence variety",
    "filter-word": "Filter word",
    "verb-strength": "Verb strength",
    "general": "General",
    "structure": "Structure",
    "theme": "Theme",
    "genre-convention": "Genre convention",
    "tense": "Tense",
    "pov": "Point of view",
    "setting": "Setting",
    "foreshadowing": "Foreshadowing",
    "continuity:characters": "Continuity — characters",
    "continuity:timeline": "Continuity — timeline",
    "continuity:geography": "Continuity — geography",
    "continuity:objects": "Continuity — objects",
    "continuity:relationships": "Continuity — relationships",
    "continuity:world": "Continuity — world rules",
  },
  sr: {
    "pacing": "Tempo",
    "dialogue": "Dijalog",
    "character": "Lik",
    "plot": "Zaplet",
    "voice": "Glas",
    "prose": "Proza",
    "clarity": "Jasnoća",
    "redundancy": "Ponavljanje",
    "show-tell": "Pokazati umesto ispričati",
    "continuity": "Kontinuitet",
    "emotion": "Emocija",
    "tension": "Tenzija",
    "stakes": "Ulog",
    "worldbuilding": "Građenje sveta",
    "crutch-phrase": "Poštapalica",
    "ai-tell": "Trag veštačke inteligencije",
    "sentence-variety": "Raznolikost rečenica",
    "filter-word": "Filterska reč",
    "verb-strength": "Snaga glagola",
    "general": "Opšte",
    "structure": "Struktura",
    "theme": "Tema",
    "genre-convention": "Žanrovska konvencija",
    "tense": "Glagolsko vreme",
    "pov": "Tačka gledišta",
    "setting": "Mesto radnje",
    "foreshadowing": "Nagoveštaj",
    "continuity:characters": "Kontinuitet — likovi",
    "continuity:timeline": "Kontinuitet — hronologija",
    "continuity:geography": "Kontinuitet — geografija",
    "continuity:objects": "Kontinuitet — predmeti",
    "continuity:relationships": "Kontinuitet — odnosi",
    "continuity:world": "Kontinuitet — pravila sveta",
  },
  de: {
    "pacing": "Tempo",
    "dialogue": "Dialog",
    "character": "Figur",
    "plot": "Handlung",
    "voice": "Stimme",
    "prose": "Prosa",
    "clarity": "Klarheit",
    "redundancy": "Redundanz",
    "show-tell": "Zeigen statt erzählen",
    "continuity": "Kontinuität",
    "emotion": "Emotion",
    "tension": "Spannung",
    "stakes": "Einsatz",
    "worldbuilding": "Weltenbau",
    "crutch-phrase": "Füllfloskel",
    "ai-tell": "KI-Spur",
    "sentence-variety": "Satzvielfalt",
    "filter-word": "Filterwort",
    "verb-strength": "Verbstärke",
    "general": "Allgemein",
    "structure": "Struktur",
    "theme": "Thema",
    "genre-convention": "Genrekonvention",
    "tense": "Zeitform",
    "pov": "Erzählperspektive",
    "setting": "Schauplatz",
    "foreshadowing": "Vorausdeutung",
    "continuity:characters": "Kontinuität — Figuren",
    "continuity:timeline": "Kontinuität — Zeitlinie",
    "continuity:geography": "Kontinuität — Schauplätze",
    "continuity:objects": "Kontinuität — Gegenstände",
    "continuity:relationships": "Kontinuität — Beziehungen",
    "continuity:world": "Kontinuität — Weltregeln",
  },
  es: {
    "pacing": "Ritmo",
    "dialogue": "Diálogo",
    "character": "Personaje",
    "plot": "Trama",
    "voice": "Voz",
    "prose": "Prosa",
    "clarity": "Claridad",
    "redundancy": "Redundancia",
    "show-tell": "Mostrar en vez de contar",
    "continuity": "Continuidad",
    "emotion": "Emoción",
    "tension": "Tensión",
    "stakes": "Riesgo",
    "worldbuilding": "Construcción del mundo",
    "crutch-phrase": "Muletilla",
    "ai-tell": "Rastro de IA",
    "sentence-variety": "Variedad de frases",
    "filter-word": "Palabra filtro",
    "verb-strength": "Fuerza verbal",
    "general": "General",
    "structure": "Estructura",
    "theme": "Tema",
    "genre-convention": "Convención de género",
    "tense": "Tiempo verbal",
    "pov": "Punto de vista",
    "setting": "Escenario",
    "foreshadowing": "Presagio",
    "continuity:characters": "Continuidad — personajes",
    "continuity:timeline": "Continuidad — cronología",
    "continuity:geography": "Continuidad — geografía",
    "continuity:objects": "Continuidad — objetos",
    "continuity:relationships": "Continuidad — relaciones",
    "continuity:world": "Continuidad — reglas del mundo",
  },
  fr: {
    "pacing": "Rythme",
    "dialogue": "Dialogue",
    "character": "Personnage",
    "plot": "Intrigue",
    "voice": "Voix",
    "prose": "Prose",
    "clarity": "Clarté",
    "redundancy": "Redondance",
    "show-tell": "Montrer plutôt que raconter",
    "continuity": "Continuité",
    "emotion": "Émotion",
    "tension": "Tension",
    "stakes": "Enjeu",
    "worldbuilding": "Construction du monde",
    "crutch-phrase": "Tic de langage",
    "ai-tell": "Trace d'IA",
    "sentence-variety": "Variété des phrases",
    "filter-word": "Mot filtre",
    "verb-strength": "Force du verbe",
    "general": "Général",
    "structure": "Structure",
    "theme": "Thème",
    "genre-convention": "Convention de genre",
    "tense": "Temps verbal",
    "pov": "Point de vue",
    "setting": "Décor",
    "foreshadowing": "Préfiguration",
    "continuity:characters": "Continuité — personnages",
    "continuity:timeline": "Continuité — chronologie",
    "continuity:geography": "Continuité — géographie",
    "continuity:objects": "Continuité — objets",
    "continuity:relationships": "Continuité — relations",
    "continuity:world": "Continuité — règles du monde",
  },
  ru: {
    "pacing": "Темп",
    "dialogue": "Диалог",
    "character": "Персонаж",
    "plot": "Сюжет",
    "voice": "Голос",
    "prose": "Проза",
    "clarity": "Ясность",
    "redundancy": "Повторы",
    "show-tell": "Показывать, а не рассказывать",
    "continuity": "Непрерывность",
    "emotion": "Эмоция",
    "tension": "Напряжение",
    "stakes": "Ставки",
    "worldbuilding": "Мир",
    "crutch-phrase": "Слово-паразит",
    "ai-tell": "След ИИ",
    "sentence-variety": "Разнообразие фраз",
    "filter-word": "Фильтрующее слово",
    "verb-strength": "Сила глагола",
    "general": "Общее",
    "structure": "Структура",
    "theme": "Тема",
    "genre-convention": "Жанровая условность",
    "tense": "Время глагола",
    "pov": "Точка зрения",
    "setting": "Место действия",
    "foreshadowing": "Предвестие",
    "continuity:characters": "Непрерывность — персонажи",
    "continuity:timeline": "Непрерывность — хронология",
    "continuity:geography": "Непрерывность — география",
    "continuity:objects": "Непрерывность — предметы",
    "continuity:relationships": "Непрерывность — отношения",
    "continuity:world": "Непрерывность — правила мира",
  },
  zh: {
    "pacing": "节奏",
    "dialogue": "对话",
    "character": "人物",
    "plot": "情节",
    "voice": "声音",
    "prose": "文笔",
    "clarity": "清晰度",
    "redundancy": "冗余",
    "show-tell": "展示而非叙述",
    "continuity": "连续性",
    "emotion": "情感",
    "tension": "张力",
    "stakes": "赌注",
    "worldbuilding": "世界观",
    "crutch-phrase": "口头禅",
    "ai-tell": "AI 痕迹",
    "sentence-variety": "句式变化",
    "filter-word": "过滤词",
    "verb-strength": "动词力度",
    "general": "综合",
    "structure": "结构",
    "theme": "主题",
    "genre-convention": "类型惯例",
    "tense": "时态",
    "pov": "叙事视角",
    "setting": "场景",
    "foreshadowing": "伏笔",
    "continuity:characters": "连续性 — 人物",
    "continuity:timeline": "连续性 — 时间线",
    "continuity:geography": "连续性 — 地理",
    "continuity:objects": "连续性 — 物品",
    "continuity:relationships": "连续性 — 关系",
    "continuity:world": "连续性 — 世界规则",
  },
};

const SEVERITY_LABELS: Record<string, Record<string, string>> = {
  en: {
    "critical": "Critical",
    "important": "Important",
    "major": "Major",
    "minor": "Minor",
    "suggestion": "Suggestion",
    "info": "Note",
  },
  sr: {
    "critical": "Kritično",
    "important": "Važno",
    "major": "Ozbiljno",
    "minor": "Sitno",
    "suggestion": "Predlog",
    "info": "Napomena",
  },
  de: {
    "critical": "Kritisch",
    "important": "Wichtig",
    "major": "Schwer",
    "minor": "Gering",
    "suggestion": "Vorschlag",
    "info": "Hinweis",
  },
  es: {
    "critical": "Crítico",
    "important": "Importante",
    "major": "Grave",
    "minor": "Menor",
    "suggestion": "Sugerencia",
    "info": "Nota",
  },
  fr: {
    "critical": "Critique",
    "important": "Important",
    "major": "Majeur",
    "minor": "Mineur",
    "suggestion": "Suggestion",
    "info": "Note",
  },
  ru: {
    "critical": "Критично",
    "important": "Важно",
    "major": "Серьёзно",
    "minor": "Мелочь",
    "suggestion": "Предложение",
    "info": "Заметка",
  },
  zh: {
    "critical": "严重",
    "important": "重要",
    "major": "较大",
    "minor": "轻微",
    "suggestion": "建议",
    "info": "备注",
  },
};

const STATUS_LABELS: Record<string, Record<string, string>> = {
  en: {
    "pending": "Pending",
    "applied": "Applied",
    "dismissed": "Dismissed",
    "rejected": "Rejected",
  },
  sr: {
    "pending": "Čeka odluku",
    "applied": "Primenjeno",
    "dismissed": "Odbačeno",
    "rejected": "Odbijeno",
  },
  de: {
    "pending": "Offen",
    "applied": "Übernommen",
    "dismissed": "Verworfen",
    "rejected": "Abgelehnt",
  },
  es: {
    "pending": "Pendiente",
    "applied": "Aplicado",
    "dismissed": "Descartado",
    "rejected": "Rechazado",
  },
  fr: {
    "pending": "En attente",
    "applied": "Appliqué",
    "dismissed": "Écarté",
    "rejected": "Refusé",
  },
  ru: {
    "pending": "Ждёт решения",
    "applied": "Применено",
    "dismissed": "Отклонено",
    "rejected": "Отказано",
  },
  zh: {
    "pending": "待处理",
    "applied": "已应用",
    "dismissed": "已忽略",
    "rejected": "已拒绝",
  },
};

function pick(
  table: Record<string, Record<string, string>>,
  value: string,
  language?: string
): string {
  const lang = (language ?? "en").split("-")[0];
  const dictionary = table[lang] ?? table.en;
  // An unknown slug is shown as-is: better a raw word the writer can report
  // than a wrong one that looks deliberate.
  return dictionary[value] ?? table.en[value] ?? value;
}

/** The writer's name for a finding category ("show-tell" -> "Pokazati umesto ispričati"). */
export function findingCategoryLabel(category: string, language?: string): string {
  return pick(CATEGORY_LABELS, category, language);
}

/** The writer's name for a severity ("important" -> "Važno"). */
export function findingSeverityLabel(severity: string, language?: string): string {
  return pick(SEVERITY_LABELS, severity, language);
}

/** The writer's name for a finding status ("pending" -> "Čeka odluku"). */
export function findingStatusLabel(status: string, language?: string): string {
  return pick(STATUS_LABELS, status, language);
}

/**
 * The whole editorial category vocabulary, in the order the writer sees it.
 *
 * This is the single source: `CreateFinding`'s tool schema is built from it, so
 * a category with no label here cannot be created, and a category the filter
 * offers can always be created. Before this, three lists disagreed — the tool
 * accepted `pov`, `setting` and `foreshadowing`, which had no label in any
 * language and rendered as raw slugs, while the filter offered `plot`, `voice`,
 * `general` and `tense`, which no agent could emit.
 */
export const FINDING_CATEGORIES = Object.keys(CATEGORY_LABELS.en);

/**
 * The six continuity domains, written as qualified categories.
 *
 * The continuity tab groups by domain and a bare "continuity" tells it nothing,
 * so the checker's prompt has always asked for `continuity:<domain>` — and the
 * strict tool schema rejected every one of those calls at the API boundary.
 * They are part of the vocabulary now.
 */
export const CONTINUITY_CATEGORIES = FINDING_CATEGORIES.filter((c) =>
  c.startsWith("continuity:")
);

/** True for a bare "continuity" finding and for every qualified domain of one. */
export function isContinuityCategory(category: string): boolean {
  return category === "continuity" || category.startsWith("continuity:");
}

/** The categories the filter offers: the qualified continuity domains fold into one row. */
export const FILTERABLE_FINDING_CATEGORIES = FINDING_CATEGORIES.filter(
  (c) => !c.startsWith("continuity:")
);

/**
 * V-4: the only severities CreateFinding can persist. Four consumers filtered on
 * "major" — a value the strict tool schema rejects — so cascade warnings,
 * blackboard promotion, book health and the Reports tab saw 4 of 255 findings.
 * Import this rather than re-typing the list.
 */
export const FINDING_SEVERITIES = ["critical", "important", "suggestion"] as const;

/**
 * The statuses a finding moves through, in the order the writer meets them.
 * The single source: the label table above and every filter read from it, so
 * a status with no label cannot be offered.
 */
export const FINDING_STATUSES = ["pending", "applied", "dismissed", "rejected"] as const;

export type FindingStatus = (typeof FINDING_STATUSES)[number];

export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];
