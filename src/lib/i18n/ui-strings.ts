/**
 * Translated UI strings for the full application interface.
 * Keyed by language code (ISO 639-1). Falls back to English.
 */

export interface UIStrings {
  // Navigation
  nav: {
    dashboard: string;
    books: string;
    series: string;
    navigation: string;
    overview: string;
    documents: string;
    editorial: string;
    import: string;
    export: string;
    reports: string;
    style: string;
    setup: string;
    chapters: string;
    addChapter: string;
    analytics: string;
    settings: string;
    account: string;
    writingPlatform: string;
    // Section labels for grouped sidebar
    sectionSetup: string;
    sectionWriting: string;
    sectionEditing: string;
    sectionAnalysis: string;
    sectionPublish: string;
    sectionTools: string;
    nextStep: string;
    library: string;
    transfer: string;
  };

  // Header
  header: {
    toggleSidebar: string;
    toggleAgent: string;
    new: string;
  };

  // Dashboard
  dashboard: {
    welcomeBack: string;
    writer: string;
    yourWorkspace: string;
    totalBooks: string;
    totalWords: string;
    totalChapters: string;
    totalSeries: string;
    recentBooks: string;
    createBook: string;
    noBooksYet: string;
    noBooksDescription: string;
    words: string;
    chapters: string;
    updated: string;
    continueWriting: string;
    lastEdited: string;
    resumeChapter: string;
    recentSessions: string;
    noSessions: string;
    writingActivity: string;
    wordsThisWeek: string;
    pendingAlerts: string;
    noAlerts: string;
    quickActions: string;
    startWriting: string;
    importManuscript: string;
    viewAll: string;
  };

  // Settings
  settings: {
    title: string;
    subtitle: string;
    apiKeys: string;
    apiKeysDescription: string;
    addKey: string;
    provider: string;
    labelOptional: string;
    apiKey: string;
    validating: string;
    cancel: string;
    noKeysTitle: string;
    noKeysDescription: string;
    default: string;
    languagePreference: string;
    languageDescription: string;
    byokTitle: string;
    byokDescription: string;
  };

  // Agent panel
  agentPanel: {
    apiKeyRequired: string;
    apiKeyDescription: string;
    goToSettings: string;
  };

  // Workflow selector
  workflowSelector: {
    chooseWorkflow: string;
    selectChapter: string;
    noChapters: string;
    back: string;
    start: string;
    setup: string;
    writing: string;
    editing: string;
    analysis: string;
    style: string;
    research: string;
    series: string;
  };

  // New book form
  newBook: {
    title: string;
    description: string;
    bookName: string;
    genre: string;
    genrePlaceholder: string;
    language: string;
    seriesOptional: string;
    noSeries: string;
    bookNumber: string;
    cancel: string;
    creating: string;
    create: string;
    bookCreated: string;
  };

  // Common
  common: {
    loading: string;
    error: string;
    save: string;
    delete: string;
    edit: string;
    close: string;
    confirm: string;
  };

  // Setup wizard
  setup: {
    title: string; subtitle: string;
    basics: string; basicsDesc: string;
    importStep: string; importDesc: string;
    styleStep: string; styleDesc: string;
    storyBible: string; storyBibleDesc: string;
    architecture: string; architectureDesc: string;
    doneStep: string; doneDesc: string;
    bookName: string; genre: string; genrePlaceholder: string;
    language: string; languageHint: string;
    descriptionOptional: string; descriptionPlaceholder: string;
    saveAndContinue: string;
    importInfo: string; manuscriptImported: string; chaptersLoaded: string;
    importMore: string; goToImport: string;
    styleInfo: string; fingerprintCaptured: string;
    captureStyle: string; reCaptureStyle: string;
    bibleInfo: string; bibleCreated: string;
    createBible: string; reCreateBible: string;
    archInfo: string; archCreated: string;
    buildArch: string; reBuildArch: string;
    setupComplete: string; bookReady: string;
    alreadyExists: string; overwriteWarning: string;
    agentRunning: string; skip: string; continueStep: string;
    back: string; reCapture: string; reCreate: string; reBuild: string; cancel: string;
  };

  // Book overview
  bookOverview: {
    settingsBtn: string; words: string; chapters: string; documents: string;
    completeSetup: string; setupDescription: string; startSetup: string;
    addChapter: string; noChapters: string;
    colNum: string; colTitle: string; colAct: string; colStatus: string; colWords: string; colScore: string; colAction: string;
    untitled: string; act: string; edit: string;
    avgBetaScore: string;
  };

  // Book settings
  bookSettings: {
    title: string; subtitle: string;
    aiModels: string; aiModelsDesc: string;
    ghostwriter: string; ghostwriterDesc: string;
    coach: string; coachDesc: string;
    creative: string; creativeDesc: string;
    editor: string; editorDesc: string;
    betaReader: string; betaReaderDesc: string;
    research: string; researchDesc: string;
    analyst: string; analystDesc: string;
    styleSection: string; styleDesc: string;
    styleStrictness: string; strict: string; balanced: string; relaxed: string;
    autoCommit: string; autoCommitDesc: string;
    betaPanel: string; betaPanelDesc: string;
    panelSize: string; consensus: string; convergence: string;
    back: string;
  };

  // Book list
  bookList: {
    title: string; newBook: string; noBooks: string; noBooksDesc: string;
    createBook: string; words: string; chapters: string;
    series: string; updated: string; book: string; books: string;
  };

  // Reports
  reports: {
    title: string; subtitle: string;
    analytics: string; continuity: string; market: string; edits: string; documents: string;
  };

  // Style page
  stylePage: {
    title: string; subtitle: string;
    refreshStyle: string; evolveStyle: string;
    noProfile: string; noProfileDesc: string;
    captureStyle: string; agentRunning: string;
  };

  // Series
  seriesPage: {
    title: string; newSeries: string; noSeries: string; noSeriesDesc: string;
    createSeries: string; books: string; docs: string;
  };

  chapterNew: {
    title: string; subtitle: string;
    chapterNumber: string; actNumber: string;
    titleOptional: string; titlePlaceholder: string;
    cancel: string; creating: string; create: string; created: string;
  };

  // Chapters index (browsable list at /books/:id/chapters)
  chaptersIndex: {
    title: string; subtitle: string; newChapter: string;
    untitled: string; words: string;
    empty: string; emptyDesc: string; loadError: string;
  };

  // Chapter status labels (writer-friendly)
  chapterStatuses: {
    undiscussed: string;
    discussed: string;
    planned: string;
    drafted: string;
    dev_edited: string;
    line_edited: string;
    beta_read: string;
    beta_passed: string;
  };

  // Chapter word-target popover (S13)
  wordTarget: {
    setTarget: string;
    popoverTitle: string;
    placeholder: string;
    clear: string;
    words: string;
  };

  // Command palette
  commandPalette: {
    placeholder: string;
    chapters: string;
    workflows: string;
    pages: string;
    recent: string;
    noResults: string;
    actions: string;
  };

  // Wiki
  wiki: {
    title: string;
    search: string;
    newEntry: string;
    all: string;
    characters: string;
    locations: string;
    items: string;
    events: string;
    lore: string;
    noEntries: string;
    noEntriesDesc: string;
    editEntry: string;
    deleteEntry: string;
    aliases: string;
    description: string;
    attributes: string;
    source: string;
    populate: string;
    populateDesc: string;
    populating: string;
    populated: string;
    noDocs: string;
  };

  // Writing dashboard
  writingDashboard: {
    title: string;
    todayWords: string;
    streak: string;
    weeklyAvg: string;
    totalWords: string;
    dailyGoal: string;
    weeklyGoal: string;
    totalGoal: string;
    setGoal: string;
    last30Days: string;
    days: string;
    noData: string;
  };

  // Journey system
  journey: {
    chooseJourney: string;
    chooseJourneyDesc: string;
    changeJourney: string;
    switchConfirmTitle: string;
    switchConfirmDesc: string;
    switchConfirmAction: string;
    cancel: string;
    recommended: string;
    steps: string;
    stepOf: string;
    allComplete: string;
    allCompleteDesc: string;
    celebrationBanner: string;
    noBannerYet: string;
    noBannerYetDesc: string;
    nextStep: string;
    startButton: string;
  };
}

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "sr", name: "Serbian" },
  { code: "de", name: "German" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "ru", name: "Russian" },
  { code: "zh", name: "Chinese" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "hr", name: "Croatian" },
] as const;

const EN: UIStrings = {
  nav: {
    dashboard: "Dashboard",
    books: "Books",
    series: "Series",
    navigation: "Navigation",
    overview: "Overview",
    documents: "Documents",
    editorial: "Editorial",
    import: "Import",
    export: "Export",
    reports: "Reports",
    style: "Style",
    setup: "Setup",
    chapters: "Chapters",
    addChapter: "Add Chapter",
    analytics: "Analytics",
    settings: "Settings",
    account: "Account",
    writingPlatform: "Writing Platform",
    sectionSetup: "Getting Started",
    sectionWriting: "Writing",
    sectionEditing: "Refining",
    sectionAnalysis: "Insights",
    sectionPublish: "Publish",
    sectionTools: "Tools",
    nextStep: "Next Step",
    library: "Library",
    transfer: "Transfer",
  },
  header: {
    toggleSidebar: "Toggle sidebar",
    toggleAgent: "Toggle agent panel",
    new: "New",
  },
  dashboard: {
    welcomeBack: "Welcome back",
    writer: "Writer",
    yourWorkspace: "Your writing workspace",
    totalBooks: "Total Books",
    totalWords: "Total Words",
    totalChapters: "Total Chapters",
    totalSeries: "Series",
    recentBooks: "Recent Books",
    createBook: "Create Book",
    noBooksYet: "No books yet",
    noBooksDescription: "Create your first book to get started",
    words: "words",
    chapters: "chapters",
    updated: "Updated",
    continueWriting: "Continue Where You Left Off",
    lastEdited: "Last edited",
    resumeChapter: "Resume",
    recentSessions: "Recent Agent Sessions",
    noSessions: "No agent sessions yet",
    writingActivity: "Writing Activity",
    wordsThisWeek: "words this week",
    pendingAlerts: "Alerts",
    noAlerts: "No pending alerts",
    quickActions: "Quick Actions",
    startWriting: "Start Writing",
    importManuscript: "Import Manuscript",
    viewAll: "View all",
  },
  settings: {
    title: "Settings",
    subtitle: "Manage your API keys and preferences",
    apiKeys: "API Keys",
    apiKeysDescription: "Bring Your Own Key (BYOK) \u2014 your API keys are encrypted at rest",
    addKey: "Add Key",
    provider: "Provider",
    labelOptional: "Label (optional)",
    apiKey: "API Key",
    validating: "Validating...",
    cancel: "Cancel",
    noKeysTitle: "No API keys configured",
    noKeysDescription: "Add one to start using AI agents.",
    default: "Default",
    languagePreference: "Language Preference",
    languageDescription: "Default language for new books and UI",
    byokTitle: "BYOK (Bring Your Own Key):",
    byokDescription: "WriteMyBook uses your API key directly. We never store or have access to your API credentials in plaintext \u2014 they are encrypted with AES-256-GCM at rest. You pay Anthropic directly for token usage.",
  },
  agentPanel: {
    apiKeyRequired: "API Key Required",
    apiKeyDescription: "Add your Anthropic API key to start using the writing agent.",
    goToSettings: "Go to Settings",
  },
  workflowSelector: {
    chooseWorkflow: "Choose a workflow to start:",
    selectChapter: "Select a chapter for this workflow:",
    noChapters: "No chapters yet. Create a chapter first.",
    back: "Back",
    start: "Start",
    setup: "Setup",
    writing: "Writing",
    editing: "Editing",
    analysis: "Analysis",
    style: "Style",
    research: "Research",
    series: "Series",
  },
  newBook: {
    title: "New Book",
    description: "Create a new book to start writing",
    bookName: "Book Name",
    genre: "Genre",
    genrePlaceholder: "Fantasy, Sci-Fi, Romance...",
    language: "Language",
    seriesOptional: "Series (optional)",
    noSeries: "No series",
    bookNumber: "Book Number",
    cancel: "Cancel",
    creating: "Creating...",
    create: "Create Book",
    bookCreated: "Book created",
  },
  common: {
    loading: "Loading...",
    error: "Error",
    save: "Save",
    delete: "Delete",
    edit: "Edit",
    close: "Close",
    confirm: "Confirm",
  },
  setup: {
    title: "Book Setup", subtitle: "Complete these steps to set up your book for writing.",
    basics: "Basics", basicsDesc: "Set your book's name, genre, and language",
    importStep: "Import", importDesc: "Import an existing manuscript (optional)",
    styleStep: "Style", styleDesc: "Capture your unique writing voice",
    storyBible: "Story Bible", storyBibleDesc: "Build your world, characters, and rules",
    architecture: "Architecture", architectureDesc: "Design your story structure",
    doneStep: "Done", doneDesc: "You're all set!",
    bookName: "Book Name", genre: "Genre", genrePlaceholder: "Fantasy, Sci-Fi, Romance...",
    language: "Language", languageHint: "Agents will write and communicate in this language",
    descriptionOptional: "Description (optional)", descriptionPlaceholder: "A brief summary of your book...",
    saveAndContinue: "Save & Continue",
    importInfo: "If you have an existing manuscript, you can import it now. This step is optional -- you can always import later.",
    manuscriptImported: "Manuscript imported", chaptersLoaded: "chapters loaded",
    importMore: "Import More", goToImport: "Go to Import",
    styleInfo: "Analyze your writing samples to create a unique voice fingerprint. The agent will examine your prose and build a style profile that guides the ghostwriter.",
    fingerprintCaptured: "Style fingerprint already captured",
    captureStyle: "Capture My Writing Style", reCaptureStyle: "Re-capture Style",
    bibleInfo: "Build a story bible with your world, characters, rules, and lore. This keeps the ghostwriter consistent across chapters.",
    bibleCreated: "Story Bible already created",
    createBible: "Create Story Bible", reCreateBible: "Re-create Story Bible",
    archInfo: "Design your story structure -- acts, chapters, plot arcs, and pacing. The agent will help you outline the full book.",
    archCreated: "Architecture already built",
    buildArch: "Build Architecture", reBuildArch: "Re-build Architecture",
    setupComplete: "Setup Complete", bookReady: "Your book is ready. You can revisit any setup step later.",
    alreadyExists: "already exists", overwriteWarning: "Running again will overwrite it. Continue?",
    agentRunning: "Agent Running...", skip: "Skip", continueStep: "Continue",
    back: "Back", reCapture: "Re-capture", reCreate: "Re-create", reBuild: "Re-build", cancel: "Cancel",
  },
  bookOverview: {
    settingsBtn: "Settings", words: "Words", chapters: "Chapters", documents: "Documents",
    completeSetup: "Complete your book setup",
    setupDescription: "Set up your style profile, story bible, and architecture to get started.",
    startSetup: "Start Setup", addChapter: "Add Chapter",
    noChapters: "No chapters yet. Add your first chapter to start writing.",
    colNum: "#", colTitle: "Title", colAct: "Act", colStatus: "Status", colWords: "Words", colScore: "Score", colAction: "Action",
    untitled: "Untitled", act: "Act", edit: "Edit",
    avgBetaScore: "Avg Beta Score",
  },
  bookSettings: {
    title: "Book Settings", subtitle: "Configure AI models and writing preferences",
    aiModels: "AI Models", aiModelsDesc: "Choose which Claude model each agent uses",
    ghostwriter: "Ghostwriter", ghostwriterDesc: "Writes chapter drafts",
    coach: "Coach", coachDesc: "Writing coach & story bible",
    creative: "Creative", creativeDesc: "Style, architecture & planning",
    editor: "Editor", editorDesc: "Dev edit, line edit & continuity",
    betaReader: "Beta Reader", betaReaderDesc: "Simulated reader panel",
    research: "Research", researchDesc: "Manuscript, market & publishing",
    analyst: "Analyst", analystDesc: "Statistics & readability",
    styleSection: "Style", styleDesc: "Control how strictly AI follows your writing style",
    styleStrictness: "Style Strictness", strict: "Strict", balanced: "Balanced", relaxed: "Relaxed",
    autoCommit: "Auto-commit", autoCommitDesc: "Automatically save agent changes",
    betaPanel: "Beta Reader Panel", betaPanelDesc: "Configure virtual beta reader settings",
    panelSize: "Panel Size", consensus: "Consensus %", convergence: "Convergence %",
    back: "Back",
  },
  bookList: {
    title: "Books", newBook: "New Book", noBooks: "No books yet",
    noBooksDesc: "Start your writing journey by creating your first book",
    createBook: "Create Book", words: "words", chapters: "chapters",
    series: "Series:", updated: "Updated", book: "book", books: "books",
  },
  reports: {
    title: "Reports", subtitle: "Analytics, continuity, market analysis, and editorial overview",
    analytics: "Analytics", continuity: "Continuity", market: "Market", edits: "Edits", documents: "Documents",
  },
  stylePage: {
    title: "Writing Style", subtitle: "Your unique voice fingerprint and style analysis",
    refreshStyle: "Refresh Style", evolveStyle: "Evolve Style",
    noProfile: "No style profile yet",
    noProfileDesc: "Analyze your writing to capture a unique voice fingerprint that guides the ghostwriter.",
    captureStyle: "Analyze My Writing Style", agentRunning: "Agent Running...",
  },
  seriesPage: {
    title: "Series", newSeries: "New Series", noSeries: "No series yet",
    noSeriesDesc: "Group related books together in a series",
    createSeries: "Create Series", books: "books", docs: "docs",
  },
  chapterNew: {
    title: "New Chapter", subtitle: "Add a new chapter to your book",
    chapterNumber: "Chapter Number", actNumber: "Act Number",
    titleOptional: "Title (optional)", titlePlaceholder: "Chapter title...",
    cancel: "Cancel", creating: "Creating...", create: "Create Chapter", created: "Chapter created",
  },
  chaptersIndex: {
    title: "Chapters", subtitle: "Browse and open any chapter in your book.", newChapter: "New chapter",
    untitled: "Untitled", words: "words",
    empty: "No chapters yet", emptyDesc: "Create your first chapter to start writing.", loadError: "Couldn't load chapters. Please try again.",
  },
  chapterStatuses: {
    undiscussed: "Fresh Start",
    discussed: "Brainstormed",
    planned: "Outlined",
    drafted: "First Draft",
    dev_edited: "Deep Edit Done",
    line_edited: "Refined",
    beta_read: "Reader Tested",
    beta_passed: "Polished",
  },
  wordTarget: {
    setTarget: "Set word target",
    popoverTitle: "Chapter word target",
    placeholder: "e.g. 2000",
    clear: "Clear",
    words: "words",
  },
  commandPalette: {
    placeholder: "Search commands, chapters, workflows...",
    chapters: "Chapters",
    workflows: "Workflows",
    pages: "Pages",
    recent: "Recent",
    noResults: "No results found",
    actions: "Actions",
  },
  wiki: {
    title: "World Wiki",
    search: "Search entities...",
    newEntry: "New Entry",
    all: "All",
    characters: "Characters",
    locations: "Locations",
    items: "Items",
    events: "Events",
    lore: "Lore",
    noEntries: "No wiki entries yet",
    noEntriesDesc: "Create entries manually or let the agent populate them from your Story Bible.",
    editEntry: "Edit",
    deleteEntry: "Delete",
    aliases: "Aliases",
    description: "Description",
    attributes: "Attributes",
    source: "Source",
    populate: "Populate from documents",
    populateDesc: "Extract characters, locations, and lore from your Story Bible and chapters.",
    populating: "Extracting entities...",
    populated: "entities created",
    noDocs: "Create a Story Bible first to auto-populate.",
  },
  writingDashboard: {
    title: "Writing Dashboard",
    todayWords: "Today's Words",
    streak: "Streak",
    weeklyAvg: "Weekly Average",
    totalWords: "Total Words",
    dailyGoal: "Daily Goal",
    weeklyGoal: "Weekly Goal",
    totalGoal: "Total Goal",
    setGoal: "Set Goal",
    last30Days: "Last 30 Days",
    days: "days",
    noData: "No writing data yet. Start writing to see your progress!",
  },
  journey: {
    chooseJourney: "Choose Your Journey",
    chooseJourneyDesc: "Select an authoring path to guide your writing process.",
    changeJourney: "Change Journey",
    switchConfirmTitle: "Switch Journey?",
    switchConfirmDesc: "Switching journeys will update your checklist. Your work is not affected.",
    switchConfirmAction: "Switch",
    cancel: "Cancel",
    recommended: "Recommended",
    steps: "Steps",
    stepOf: "of",
    allComplete: "Journey Complete!",
    allCompleteDesc: "You have completed all steps in this journey. Congratulations!",
    celebrationBanner: "Your manuscript journey is complete!",
    noBannerYet: "No Journey Selected",
    noBannerYetDesc: "Choose a journey to see your progress checklist.",
    nextStep: "Next Step",
    startButton: "Start",
  },
};

const SR: UIStrings = {
  nav: {
    dashboard: "Kontrolna tabla",
    books: "Knjige",
    series: "Serijali",
    navigation: "Navigacija",
    overview: "Pregled",
    documents: "Dokumenta",
    editorial: "Lektura",
    import: "Uvoz",
    export: "Izvoz",
    reports: "Izveštaji",
    style: "Stil",
    setup: "Podešavanje",
    chapters: "Poglavlja",
    addChapter: "Dodaj poglavlje",
    analytics: "Analitika",
    settings: "Podešavanja",
    account: "Nalog",
    writingPlatform: "Platforma za pisanje",
    sectionSetup: "Početak",
    sectionWriting: "Pisanje",
    sectionEditing: "Usavršavanje",
    sectionAnalysis: "Uvidi",
    sectionPublish: "Objavi",
    sectionTools: "Alatke",
    nextStep: "Sledeći korak",
    library: "Biblioteka",
    transfer: "Prenos",
  },
  header: {
    toggleSidebar: "Prikaži/sakrij bočnu traku",
    toggleAgent: "Prikaži/sakrij panel agenta",
    new: "Novo",
  },
  dashboard: {
    welcomeBack: "Dobro došli nazad",
    writer: "Pisac",
    yourWorkspace: "Vaš radni prostor za pisanje",
    totalBooks: "Ukupno knjiga",
    totalWords: "Ukupno reči",
    totalChapters: "Ukupno poglavlja",
    totalSeries: "Serijali",
    recentBooks: "Nedavne knjige",
    createBook: "Kreiraj knjigu",
    noBooksYet: "Još nema knjiga",
    noBooksDescription: "Kreirajte svoju prvu knjigu da biste počeli",
    words: "reči",
    chapters: "poglavlja",
    updated: "Ažurirano",
    continueWriting: "Nastavite gde ste stali",
    lastEdited: "Poslednji put uređeno",
    resumeChapter: "Nastavi",
    recentSessions: "Nedavne sesije agenata",
    noSessions: "Još nema sesija agenata",
    writingActivity: "Aktivnost pisanja",
    wordsThisWeek: "reči ove nedelje",
    pendingAlerts: "Obaveštenja",
    noAlerts: "Nema obaveštenja na čekanju",
    quickActions: "Brze radnje",
    startWriting: "Počni pisanje",
    importManuscript: "Uvezi rukopis",
    viewAll: "Prikaži sve",
  },
  settings: {
    title: "Podešavanja",
    subtitle: "Upravljajte API ključevima i preferencama",
    apiKeys: "API ključevi",
    apiKeysDescription: "Koristite sopstveni ključ (BYOK) \u2014 vaši API ključevi su šifrovani",
    addKey: "Dodaj ključ",
    provider: "Provajder",
    labelOptional: "Oznaka (opciono)",
    apiKey: "API ključ",
    validating: "Validacija...",
    cancel: "Otkaži",
    noKeysTitle: "Nema konfiguriranih API ključeva",
    noKeysDescription: "Dodajte jedan da počnete koristiti AI agente.",
    default: "Podrazumevani",
    languagePreference: "Jezičke preferencе",
    languageDescription: "Podrazumevani jezik za nove knjige i interfejs",
    byokTitle: "BYOK (Koristite sopstveni ključ):",
    byokDescription: "WriteMyBook koristi vaš API ključ direktno. Nikada ne čuvamo niti imamo pristup vašim akreditivima u čistom tekstu \u2014 šifrovani su AES-256-GCM algoritmom. Plaćate Anthropic direktno za upotrebu tokena.",
  },
  agentPanel: {
    apiKeyRequired: "Potreban API ključ",
    apiKeyDescription: "Dodajte vaš Anthropic API ključ da biste počeli koristiti agenta za pisanje.",
    goToSettings: "Idi na podešavanja",
  },
  workflowSelector: {
    chooseWorkflow: "Izaberite tok rada:",
    selectChapter: "Izaberite poglavlje za ovaj tok rada:",
    noChapters: "Još nema poglavlja. Prvo kreirajte poglavlje.",
    back: "Nazad",
    start: "Pokreni",
    setup: "Podešavanje",
    writing: "Pisanje",
    editing: "Uređivanje",
    analysis: "Analiza",
    style: "Stil",
    research: "Istraživanje",
    series: "Serijal",
  },
  newBook: {
    title: "Nova knjiga",
    description: "Kreirajte novu knjigu da počnete pisati",
    bookName: "Naziv knjige",
    genre: "Žanr",
    genrePlaceholder: "Fantastika, Naučna fantastika, Ljubavni roman...",
    language: "Jezik",
    seriesOptional: "Serijal (opciono)",
    noSeries: "Bez serijala",
    bookNumber: "Broj knjige",
    cancel: "Otkaži",
    creating: "Kreiranje...",
    create: "Kreiraj knjigu",
    bookCreated: "Knjiga kreirana",
  },
  common: {
    loading: "Učitavanje...",
    error: "Greška",
    save: "Sačuvaj",
    delete: "Obriši",
    edit: "Uredi",
    close: "Zatvori",
    confirm: "Potvrdi",
  },
  setup: {
    title: "Podešavanje knjige", subtitle: "Završite ove korake da pripremite knjigu za pisanje.",
    basics: "Osnove", basicsDesc: "Podesite ime, žanr i jezik knjige",
    importStep: "Uvoz", importDesc: "Uvezite postojeći rukopis (opciono)",
    styleStep: "Stil", styleDesc: "Uhvatite vaš jedinstveni glas",
    storyBible: "Biblija priče", storyBibleDesc: "Izgradite svet, likove i pravila",
    architecture: "Arhitektura", architectureDesc: "Dizajnirajte strukturu priče",
    doneStep: "Gotovo", doneDesc: "Sve je spremno!",
    bookName: "Naziv knjige", genre: "Žanr", genrePlaceholder: "Fantastika, Naučna fantastika, Ljubavni roman...",
    language: "Jezik", languageHint: "Agenti će pisati i komunicirati na ovom jeziku",
    descriptionOptional: "Opis (opciono)", descriptionPlaceholder: "Kratak rezime vaše knjige...",
    saveAndContinue: "Sačuvaj i nastavi",
    importInfo: "Ako imate postojeći rukopis, možete ga uvesti sada. Ovaj korak je opcioni -- uvek možete uvesti kasnije.",
    manuscriptImported: "Rukopis uvezen", chaptersLoaded: "poglavlja učitano",
    importMore: "Uvezi još", goToImport: "Idi na uvoz",
    styleInfo: "Analizirajte vaše uzorke pisanja da kreirate jedinstven otisak glasa. Agent će ispitati vašu prozu i napraviti profil stila koji vodi pisca.",
    fingerprintCaptured: "Otisak stila je već uhvaćen",
    captureStyle: "Uhvati moj stil pisanja", reCaptureStyle: "Ponovo uhvati stil",
    bibleInfo: "Izgradite bibliju priče sa svetom, likovima, pravilima i legendama. Ovo održava pisca doslednim kroz poglavlja.",
    bibleCreated: "Biblija priče je već kreirana",
    createBible: "Kreiraj bibliju priče", reCreateBible: "Ponovo kreiraj bibliju priče",
    archInfo: "Dizajnirajte strukturu priče -- činove, poglavlja, zaplete i tempo. Agent će vam pomoći da napravite nacrt cele knjige.",
    archCreated: "Arhitektura je već izgrađena",
    buildArch: "Izgradi arhitekturu", reBuildArch: "Ponovo izgradi arhitekturu",
    setupComplete: "Podešavanje završeno", bookReady: "Vaša knjiga je spremna. Možete se vratiti na bilo koji korak kasnije.",
    alreadyExists: "već postoji", overwriteWarning: "Pokretanje ponovo će prebrisati. Nastaviti?",
    agentRunning: "Agent radi...", skip: "Preskoči", continueStep: "Nastavi",
    back: "Nazad", reCapture: "Ponovo uhvati", reCreate: "Ponovo kreiraj", reBuild: "Ponovo izgradi", cancel: "Otkaži",
  },
  bookOverview: {
    settingsBtn: "Podešavanja", words: "Reči", chapters: "Poglavlja", documents: "Dokumenta",
    completeSetup: "Završite podešavanje knjige",
    setupDescription: "Podesite profil stila, bibliju priče i arhitekturu da biste počeli.",
    startSetup: "Započni podešavanje", addChapter: "Dodaj poglavlje",
    noChapters: "Još nema poglavlja. Dodajte prvo poglavlje da počnete pisati.",
    colNum: "#", colTitle: "Naslov", colAct: "Čin", colStatus: "Status", colWords: "Reči", colScore: "Ocena", colAction: "Radnja",
    untitled: "Bez naslova", act: "Čin", edit: "Uredi",
    avgBetaScore: "Prosečna beta ocena",
  },
  bookSettings: {
    title: "Podešavanja knjige", subtitle: "Konfigurišite AI modele i preference pisanja",
    aiModels: "AI modeli", aiModelsDesc: "Izaberite koji Claude model koristi svaki agent",
    ghostwriter: "Pisac", ghostwriterDesc: "Piše nacrte poglavlja",
    coach: "Trener", coachDesc: "Trener za pisanje i biblija priče",
    creative: "Kreativni", creativeDesc: "Stil, arhitektura i planiranje",
    editor: "Urednik", editorDesc: "Razvojna, jezička redakcija i kontinuitet",
    betaReader: "Beta čitalac", betaReaderDesc: "Simulirani panel čitalaca",
    research: "Istraživanje", researchDesc: "Rukopis, tržište i izdavaštvo",
    analyst: "Analitičar", analystDesc: "Statistika i čitljivost",
    styleSection: "Stil", styleDesc: "Kontrolišite koliko strogo AI prati vaš stil pisanja",
    styleStrictness: "Strogost stila", strict: "Strogo", balanced: "Uravnoteženo", relaxed: "Opušteno",
    autoCommit: "Automatsko čuvanje", autoCommitDesc: "Automatski sačuvaj izmene agenta",
    betaPanel: "Panel beta čitalaca", betaPanelDesc: "Konfigurišite podešavanja virtualnog beta čitanja",
    panelSize: "Veličina panela", consensus: "Konsenzus %", convergence: "Konvergencija %",
    back: "Nazad",
  },
  bookList: {
    title: "Knjige", newBook: "Nova knjiga", noBooks: "Još nema knjiga",
    noBooksDesc: "Započnite pisanje kreiranjem vaše prve knjige",
    createBook: "Kreiraj knjigu", words: "reči", chapters: "poglavlja",
    series: "Serijal:", updated: "Ažurirano", book: "knjiga", books: "knjiga",
  },
  reports: {
    title: "Izveštaji", subtitle: "Analitika, kontinuitet, analiza tržišta i pregled redakcije",
    analytics: "Analitika", continuity: "Kontinuitet", market: "Tržište", edits: "Izmene", documents: "Dokumenta",
  },
  stylePage: {
    title: "Stil pisanja", subtitle: "Vaš jedinstveni otisak glasa i analiza stila",
    refreshStyle: "Osveži stil", evolveStyle: "Razvij stil",
    noProfile: "Još nema profila stila",
    noProfileDesc: "Analizirajte vaše pisanje da uhvatite jedinstven otisak glasa koji vodi pisca.",
    captureStyle: "Analiziraj moj stil pisanja", agentRunning: "Agent radi...",
  },
  seriesPage: {
    title: "Serijali", newSeries: "Novi serijal", noSeries: "Još nema serijala",
    noSeriesDesc: "Grupišite povezane knjige u serijal",
    createSeries: "Kreiraj serijal", books: "knjiga", docs: "dokumenata",
  },
  chapterNew: {
    title: "Novo poglavlje", subtitle: "Dodajte novo poglavlje u knjigu",
    chapterNumber: "Broj poglavlja", actNumber: "Broj čina",
    titleOptional: "Naslov (opciono)", titlePlaceholder: "Naslov poglavlja...",
    cancel: "Otkaži", creating: "Kreiranje...", create: "Kreiraj poglavlje", created: "Poglavlje kreirano",
  },
  chaptersIndex: {
    title: "Poglavlja", subtitle: "Pregledajte i otvorite bilo koje poglavlje u vašoj knjizi.", newChapter: "Novo poglavlje",
    untitled: "Bez naslova", words: "reči",
    empty: "Još nema poglavlja", emptyDesc: "Kreirajte prvo poglavlje da započnete pisanje.", loadError: "Učitavanje poglavlja nije uspelo. Pokušajte ponovo.",
  },
  chapterStatuses: {
    undiscussed: "Novi početak",
    discussed: "Razmotreno",
    planned: "Skicirano",
    drafted: "Prva verzija",
    dev_edited: "Duboka redakcija",
    line_edited: "Precizirano",
    beta_read: "Testirano",
    beta_passed: "Uglačano",
  },
  wordTarget: {
    setTarget: "Postavi ciljani broj reči",
    popoverTitle: "Ciljani broj reči poglavlja",
    placeholder: "npr. 2000",
    clear: "Ukloni",
    words: "reči",
  },
  commandPalette: {
    placeholder: "Pretražite komande, poglavlja, tokove rada...",
    chapters: "Poglavlja",
    workflows: "Tokovi rada",
    pages: "Stranice",
    recent: "Nedavno",
    noResults: "Nema rezultata",
    actions: "Radnje",
  },
  wiki: {
    title: "Wiki sveta",
    search: "Pretražite entitete...",
    newEntry: "Novi unos",
    all: "Svi",
    characters: "Likovi",
    locations: "Lokacije",
    items: "Predmeti",
    events: "Događaji",
    lore: "Mitologija",
    noEntries: "Još nema unosa",
    noEntriesDesc: "Kreirajte unose ručno ili pustite agenta da ih popuni iz Biblije priče.",
    editEntry: "Uredi",
    deleteEntry: "Obriši",
    aliases: "Pseudonimi",
    description: "Opis",
    attributes: "Atributi",
    source: "Izvor",
    populate: "Popuni iz dokumenata",
    populateDesc: "Izvuci likove, lokacije i mitologiju iz Biblije priče i poglavlja.",
    populating: "Izvlačenje entiteta...",
    populated: "entiteta kreirano",
    noDocs: "Prvo kreirajte Bibliju priče za automatsko popunjavanje.",
  },
  writingDashboard: {
    title: "Panel pisanja",
    todayWords: "Reči danas",
    streak: "Niz dana",
    weeklyAvg: "Nedeljni prosek",
    totalWords: "Ukupno reči",
    dailyGoal: "Dnevni cilj",
    weeklyGoal: "Nedeljni cilj",
    totalGoal: "Ukupni cilj",
    setGoal: "Postavi cilj",
    last30Days: "Poslednjih 30 dana",
    days: "dana",
    noData: "Još nema podataka o pisanju. Počnite da pišete da vidite napredak!",
  },
  journey: {
    chooseJourney: "Izaberite putovanje",
    chooseJourneyDesc: "Izaberite autorski put koji će voditi vaš proces pisanja.",
    changeJourney: "Promeni putovanje",
    switchConfirmTitle: "Promeniti putovanje?",
    switchConfirmDesc: "Promena putovanja će ažurirati vašu kontrolnu listu. Vaš rad nije pogođen.",
    switchConfirmAction: "Promeni",
    cancel: "Otkaži",
    recommended: "Preporučeno",
    steps: "Koraci",
    stepOf: "od",
    allComplete: "Putovanje završeno!",
    allCompleteDesc: "Završili ste sve korake ovog putovanja. Čestitamo!",
    celebrationBanner: "Vaše putovanje rukopisa je završeno!",
    noBannerYet: "Nema izabranog putovanja",
    noBannerYetDesc: "Izaberite putovanje da vidite kontrolnu listu napretka.",
    nextStep: "Sledeći korak",
    startButton: "Započni",
  },
};

const DE: UIStrings = {
  nav: {
    dashboard: "Dashboard",
    books: "Bücher",
    series: "Serien",
    navigation: "Navigation",
    overview: "Übersicht",
    documents: "Dokumente",
    editorial: "Lektorat",
    import: "Import",
    export: "Export",
    reports: "Berichte",
    style: "Stil",
    setup: "Einrichtung",
    chapters: "Kapitel",
    addChapter: "Kapitel hinzufügen",
    analytics: "Analytik",
    settings: "Einstellungen",
    account: "Konto",
    writingPlatform: "Schreibplattform",
    sectionSetup: "Erste Schritte",
    sectionWriting: "Schreiben",
    sectionEditing: "Feinarbeit",
    sectionAnalysis: "Einblicke",
    sectionPublish: "Veröffentlichen",
    sectionTools: "Werkzeuge",
    nextStep: "Nächster Schritt",
    library: "Bibliothek",
    transfer: "Übertragung",
  },
  header: {
    toggleSidebar: "Seitenleiste umschalten",
    toggleAgent: "Agentenpanel umschalten",
    new: "Neu",
  },
  dashboard: {
    welcomeBack: "Willkommen zurück",
    writer: "Autor",
    yourWorkspace: "Ihr Schreib-Arbeitsbereich",
    totalBooks: "Bücher gesamt",
    totalWords: "Wörter gesamt",
    totalChapters: "Kapitel gesamt",
    totalSeries: "Serien",
    recentBooks: "Aktuelle Bücher",
    createBook: "Buch erstellen",
    noBooksYet: "Noch keine Bücher",
    noBooksDescription: "Erstellen Sie Ihr erstes Buch, um loszulegen",
    words: "Wörter",
    chapters: "Kapitel",
    updated: "Aktualisiert",
    continueWriting: "Dort weitermachen, wo Sie aufgehört haben",
    lastEdited: "Zuletzt bearbeitet",
    resumeChapter: "Fortsetzen",
    recentSessions: "Letzte Agentensitzungen",
    noSessions: "Noch keine Agentensitzungen",
    writingActivity: "Schreibaktivität",
    wordsThisWeek: "Wörter diese Woche",
    pendingAlerts: "Benachrichtigungen",
    noAlerts: "Keine ausstehenden Benachrichtigungen",
    quickActions: "Schnellaktionen",
    startWriting: "Schreiben starten",
    importManuscript: "Manuskript importieren",
    viewAll: "Alle anzeigen",
  },
  settings: {
    title: "Einstellungen",
    subtitle: "Verwalten Sie Ihre API-Schlüssel und Einstellungen",
    apiKeys: "API-Schlüssel",
    apiKeysDescription: "Eigener Schlüssel (BYOK) \u2014 Ihre API-Schlüssel sind verschlüsselt gespeichert",
    addKey: "Schlüssel hinzufügen",
    provider: "Anbieter",
    labelOptional: "Bezeichnung (optional)",
    apiKey: "API-Schlüssel",
    validating: "Validierung...",
    cancel: "Abbrechen",
    noKeysTitle: "Keine API-Schlüssel konfiguriert",
    noKeysDescription: "Fügen Sie einen hinzu, um AI-Agenten zu nutzen.",
    default: "Standard",
    languagePreference: "Spracheinstellung",
    languageDescription: "Standardsprache für neue Bücher und Benutzeroberfläche",
    byokTitle: "BYOK (Eigener Schlüssel):",
    byokDescription: "WriteMyBook verwendet Ihren API-Schlüssel direkt. Wir speichern Ihre Zugangsdaten nie im Klartext \u2014 sie werden mit AES-256-GCM verschlüsselt. Sie zahlen Anthropic direkt für die Token-Nutzung.",
  },
  agentPanel: {
    apiKeyRequired: "API-Schlüssel erforderlich",
    apiKeyDescription: "Fügen Sie Ihren Anthropic API-Schlüssel hinzu, um den Schreib-Agenten zu nutzen.",
    goToSettings: "Zu Einstellungen",
  },
  workflowSelector: {
    chooseWorkflow: "Wählen Sie einen Workflow:",
    selectChapter: "Wählen Sie ein Kapitel für diesen Workflow:",
    noChapters: "Noch keine Kapitel. Erstellen Sie zuerst ein Kapitel.",
    back: "Zurück",
    start: "Starten",
    setup: "Einrichtung",
    writing: "Schreiben",
    editing: "Bearbeitung",
    analysis: "Analyse",
    style: "Stil",
    research: "Recherche",
    series: "Serie",
  },
  newBook: {
    title: "Neues Buch",
    description: "Erstellen Sie ein neues Buch, um mit dem Schreiben zu beginnen",
    bookName: "Buchtitel",
    genre: "Genre",
    genrePlaceholder: "Fantasy, Science-Fiction, Romanze...",
    language: "Sprache",
    seriesOptional: "Serie (optional)",
    noSeries: "Keine Serie",
    bookNumber: "Buchnummer",
    cancel: "Abbrechen",
    creating: "Wird erstellt...",
    create: "Buch erstellen",
    bookCreated: "Buch erstellt",
  },
  common: {
    loading: "Laden...",
    error: "Fehler",
    save: "Speichern",
    delete: "Löschen",
    edit: "Bearbeiten",
    close: "Schließen",
    confirm: "Bestätigen",
  },
  setup: {
    title: "Bucheinrichtung", subtitle: "Schließen Sie diese Schritte ab, um Ihr Buch zum Schreiben vorzubereiten.",
    basics: "Grundlagen", basicsDesc: "Name, Genre und Sprache Ihres Buches festlegen",
    importStep: "Import", importDesc: "Ein vorhandenes Manuskript importieren (optional)",
    styleStep: "Stil", styleDesc: "Ihren einzigartigen Schreibstil erfassen",
    storyBible: "Story-Bibel", storyBibleDesc: "Welt, Figuren und Regeln aufbauen",
    architecture: "Architektur", architectureDesc: "Die Struktur Ihrer Geschichte entwerfen",
    doneStep: "Fertig", doneDesc: "Alles ist bereit!",
    bookName: "Buchtitel", genre: "Genre", genrePlaceholder: "Fantasy, Science-Fiction, Romanze...",
    language: "Sprache", languageHint: "Agenten schreiben und kommunizieren in dieser Sprache",
    descriptionOptional: "Beschreibung (optional)", descriptionPlaceholder: "Eine kurze Zusammenfassung Ihres Buches...",
    saveAndContinue: "Speichern & Weiter",
    importInfo: "Wenn Sie ein vorhandenes Manuskript haben, können Sie es jetzt importieren. Dieser Schritt ist optional -- Sie können jederzeit später importieren.",
    manuscriptImported: "Manuskript importiert", chaptersLoaded: "Kapitel geladen",
    importMore: "Mehr importieren", goToImport: "Zum Import",
    styleInfo: "Analysieren Sie Ihre Schreibproben, um einen einzigartigen Stimm-Fingerabdruck zu erstellen. Der Agent untersucht Ihre Prosa und erstellt ein Stilprofil, das den Ghostwriter leitet.",
    fingerprintCaptured: "Stil-Fingerabdruck bereits erfasst",
    captureStyle: "Meinen Schreibstil erfassen", reCaptureStyle: "Stil neu erfassen",
    bibleInfo: "Erstellen Sie eine Story-Bibel mit Ihrer Welt, Figuren, Regeln und Überlieferungen. Dies hält den Ghostwriter kapitelübergreifend konsistent.",
    bibleCreated: "Story-Bibel bereits erstellt",
    createBible: "Story-Bibel erstellen", reCreateBible: "Story-Bibel neu erstellen",
    archInfo: "Entwerfen Sie Ihre Geschichtsstruktur -- Akte, Kapitel, Handlungsbögen und Tempo. Der Agent hilft Ihnen, das gesamte Buch zu skizzieren.",
    archCreated: "Architektur bereits erstellt",
    buildArch: "Architektur erstellen", reBuildArch: "Architektur neu erstellen",
    setupComplete: "Einrichtung abgeschlossen", bookReady: "Ihr Buch ist bereit. Sie können jeden Einrichtungsschritt später erneut besuchen.",
    alreadyExists: "existiert bereits", overwriteWarning: "Erneutes Ausführen überschreibt es. Fortfahren?",
    agentRunning: "Agent läuft...", skip: "Überspringen", continueStep: "Weiter",
    back: "Zurück", reCapture: "Neu erfassen", reCreate: "Neu erstellen", reBuild: "Neu erstellen", cancel: "Abbrechen",
  },
  bookOverview: {
    settingsBtn: "Einstellungen", words: "Wörter", chapters: "Kapitel", documents: "Dokumente",
    completeSetup: "Bucheinrichtung abschließen",
    setupDescription: "Richten Sie Stilprofil, Story-Bibel und Architektur ein, um zu beginnen.",
    startSetup: "Einrichtung starten", addChapter: "Kapitel hinzufügen",
    noChapters: "Noch keine Kapitel. Fügen Sie Ihr erstes Kapitel hinzu, um zu beginnen.",
    colNum: "#", colTitle: "Titel", colAct: "Akt", colStatus: "Status", colWords: "Wörter", colScore: "Bewertung", colAction: "Aktion",
    untitled: "Ohne Titel", act: "Akt", edit: "Bearbeiten",
    avgBetaScore: "Durchschn. Beta-Bewertung",
  },
  bookSettings: {
    title: "Bucheinstellungen", subtitle: "KI-Modelle und Schreibeinstellungen konfigurieren",
    aiModels: "KI-Modelle", aiModelsDesc: "Wählen Sie, welches Claude-Modell jeder Agent verwendet",
    ghostwriter: "Ghostwriter", ghostwriterDesc: "Schreibt Kapitelentwürfe",
    coach: "Coach", coachDesc: "Schreibcoach & Story-Bibel",
    creative: "Kreativ", creativeDesc: "Stil, Architektur & Planung",
    editor: "Lektor", editorDesc: "Entwicklungs-, Zeilenredaktion & Kontinuität",
    betaReader: "Beta-Leser", betaReaderDesc: "Simuliertes Leser-Panel",
    research: "Recherche", researchDesc: "Manuskript, Markt & Verlag",
    analyst: "Analyst", analystDesc: "Statistik & Lesbarkeit",
    styleSection: "Stil", styleDesc: "Steuern Sie, wie streng die KI Ihrem Schreibstil folgt",
    styleStrictness: "Stilstrenge", strict: "Streng", balanced: "Ausgewogen", relaxed: "Locker",
    autoCommit: "Auto-Speichern", autoCommitDesc: "Änderungen des Agenten automatisch speichern",
    betaPanel: "Beta-Leser-Panel", betaPanelDesc: "Virtuelle Beta-Leser-Einstellungen konfigurieren",
    panelSize: "Panelgröße", consensus: "Konsens %", convergence: "Konvergenz %",
    back: "Zurück",
  },
  bookList: {
    title: "Bücher", newBook: "Neues Buch", noBooks: "Noch keine Bücher",
    noBooksDesc: "Beginnen Sie Ihre Schreibreise mit Ihrem ersten Buch",
    createBook: "Buch erstellen", words: "Wörter", chapters: "Kapitel",
    series: "Serie:", updated: "Aktualisiert", book: "Buch", books: "Bücher",
  },
  reports: {
    title: "Berichte", subtitle: "Analytik, Kontinuität, Marktanalyse und Lektoratsübersicht",
    analytics: "Analytik", continuity: "Kontinuität", market: "Markt", edits: "Lektorat", documents: "Dokumente",
  },
  stylePage: {
    title: "Schreibstil", subtitle: "Ihr einzigartiger Stimm-Fingerabdruck und Stilanalyse",
    refreshStyle: "Stil aktualisieren", evolveStyle: "Stil weiterentwickeln",
    noProfile: "Noch kein Stilprofil",
    noProfileDesc: "Analysieren Sie Ihr Schreiben, um einen einzigartigen Stimm-Fingerabdruck zu erfassen, der den Ghostwriter leitet.",
    captureStyle: "Meinen Schreibstil analysieren", agentRunning: "Agent läuft...",
  },
  seriesPage: {
    title: "Serien", newSeries: "Neue Serie", noSeries: "Noch keine Serien",
    noSeriesDesc: "Gruppieren Sie verwandte Bücher in einer Serie",
    createSeries: "Serie erstellen", books: "Bücher", docs: "Dokumente",
  },
  chapterNew: {
    title: "Neues Kapitel", subtitle: "Fügen Sie Ihrem Buch ein neues Kapitel hinzu",
    chapterNumber: "Kapitelnummer", actNumber: "Aktnummer",
    titleOptional: "Titel (optional)", titlePlaceholder: "Kapiteltitel...",
    cancel: "Abbrechen", creating: "Wird erstellt...", create: "Kapitel erstellen", created: "Kapitel erstellt",
  },
  chaptersIndex: {
    title: "Kapitel", subtitle: "Durchsuchen und öffnen Sie jedes Kapitel Ihres Buches.", newChapter: "Neues Kapitel",
    untitled: "Ohne Titel", words: "Wörter",
    empty: "Noch keine Kapitel", emptyDesc: "Erstellen Sie Ihr erstes Kapitel, um mit dem Schreiben zu beginnen.", loadError: "Kapitel konnten nicht geladen werden. Bitte versuchen Sie es erneut.",
  },
  chapterStatuses: {
    undiscussed: "Neustart",
    discussed: "Besprochen",
    planned: "Skizziert",
    drafted: "Erster Entwurf",
    dev_edited: "Tiefenredaktion",
    line_edited: "Verfeinert",
    beta_read: "Lesertest",
    beta_passed: "Poliert",
  },
  wordTarget: {
    setTarget: "Wortziel festlegen",
    popoverTitle: "Wortziel des Kapitels",
    placeholder: "z. B. 2000",
    clear: "Entfernen",
    words: "Wörter",
  },
  commandPalette: {
    placeholder: "Befehle, Kapitel, Workflows suchen...",
    chapters: "Kapitel",
    workflows: "Workflows",
    pages: "Seiten",
    recent: "Zuletzt",
    noResults: "Keine Ergebnisse",
    actions: "Aktionen",
  },
  wiki: {
    title: "Welt-Wiki",
    search: "Einträge suchen...",
    newEntry: "Neuer Eintrag",
    all: "Alle",
    characters: "Figuren",
    locations: "Orte",
    items: "Gegenstände",
    events: "Ereignisse",
    lore: "Überlieferungen",
    noEntries: "Noch keine Wiki-Einträge",
    noEntriesDesc: "Erstellen Sie Einträge manuell oder lassen Sie den Agenten sie aus Ihrer Story-Bibel befüllen.",
    editEntry: "Bearbeiten",
    deleteEntry: "Löschen",
    aliases: "Aliase",
    description: "Beschreibung",
    attributes: "Attribute",
    source: "Quelle",
    populate: "Aus Dokumenten befüllen",
    populateDesc: "Figuren, Orte und Überlieferungen aus Ihrer Story-Bibel extrahieren.",
    populating: "Einträge werden extrahiert...",
    populated: "Einträge erstellt",
    noDocs: "Erstellen Sie zuerst eine Story-Bibel.",
  },
  writingDashboard: {
    title: "Schreib-Dashboard",
    todayWords: "Wörter heute",
    streak: "Serie",
    weeklyAvg: "Wochendurchschnitt",
    totalWords: "Wörter gesamt",
    dailyGoal: "Tagesziel",
    weeklyGoal: "Wochenziel",
    totalGoal: "Gesamtziel",
    setGoal: "Ziel setzen",
    last30Days: "Letzte 30 Tage",
    days: "Tage",
    noData: "Noch keine Schreibdaten. Beginnen Sie zu schreiben, um Ihren Fortschritt zu sehen!",
  },
  journey: {
    chooseJourney: "Wählen Sie Ihre Reise",
    chooseJourneyDesc: "Wählen Sie einen Autorenpfad, der Ihren Schreibprozess leitet.",
    changeJourney: "Reise ändern",
    switchConfirmTitle: "Reise wechseln?",
    switchConfirmDesc: "Ein Wechsel der Reise aktualisiert Ihre Checkliste. Ihre Arbeit bleibt unberührt.",
    switchConfirmAction: "Wechseln",
    cancel: "Abbrechen",
    recommended: "Empfohlen",
    steps: "Schritte",
    stepOf: "von",
    allComplete: "Reise abgeschlossen!",
    allCompleteDesc: "Sie haben alle Schritte dieser Reise abgeschlossen. Herzlichen Glückwunsch!",
    celebrationBanner: "Ihre Manuskriptreise ist abgeschlossen!",
    noBannerYet: "Keine Reise ausgewählt",
    noBannerYetDesc: "Wählen Sie eine Reise, um Ihre Fortschritts-Checkliste zu sehen.",
    nextStep: "Nächster Schritt",
    startButton: "Starten",
  },
};

const ES: UIStrings = {
  nav: {
    dashboard: "Panel",
    books: "Libros",
    series: "Series",
    navigation: "Navegación",
    overview: "Vista general",
    documents: "Documentos",
    editorial: "Editorial",
    import: "Importar",
    export: "Exportar",
    reports: "Informes",
    style: "Estilo",
    setup: "Configuración",
    chapters: "Capítulos",
    addChapter: "Añadir capítulo",
    analytics: "Analítica",
    settings: "Ajustes",
    account: "Cuenta",
    writingPlatform: "Plataforma de escritura",
    sectionSetup: "Primeros pasos",
    sectionWriting: "Escritura",
    sectionEditing: "Refinamiento",
    sectionAnalysis: "Perspectivas",
    sectionPublish: "Publicar",
    sectionTools: "Herramientas",
    nextStep: "Siguiente paso",
    library: "Biblioteca",
    transfer: "Transferencia",
  },
  header: {
    toggleSidebar: "Alternar barra lateral",
    toggleAgent: "Alternar panel del agente",
    new: "Nuevo",
  },
  dashboard: {
    welcomeBack: "Bienvenido de vuelta",
    writer: "Escritor",
    yourWorkspace: "Tu espacio de escritura",
    totalBooks: "Total de libros",
    totalWords: "Total de palabras",
    totalChapters: "Total de capítulos",
    totalSeries: "Series",
    recentBooks: "Libros recientes",
    createBook: "Crear libro",
    noBooksYet: "Aún no hay libros",
    noBooksDescription: "Crea tu primer libro para empezar",
    words: "palabras",
    chapters: "capítulos",
    updated: "Actualizado",
    continueWriting: "Continúa donde lo dejaste",
    lastEdited: "Última edición",
    resumeChapter: "Continuar",
    recentSessions: "Sesiones recientes de agentes",
    noSessions: "Aún no hay sesiones de agentes",
    writingActivity: "Actividad de escritura",
    wordsThisWeek: "palabras esta semana",
    pendingAlerts: "Alertas",
    noAlerts: "No hay alertas pendientes",
    quickActions: "Acciones rápidas",
    startWriting: "Empezar a escribir",
    importManuscript: "Importar manuscrito",
    viewAll: "Ver todo",
  },
  settings: {
    title: "Ajustes",
    subtitle: "Gestiona tus claves API y preferencias",
    apiKeys: "Claves API",
    apiKeysDescription: "Trae tu propia clave (BYOK) \u2014 tus claves API están cifradas en reposo",
    addKey: "Añadir clave",
    provider: "Proveedor",
    labelOptional: "Etiqueta (opcional)",
    apiKey: "Clave API",
    validating: "Validando...",
    cancel: "Cancelar",
    noKeysTitle: "Sin claves API configuradas",
    noKeysDescription: "Añade una para empezar a usar los agentes IA.",
    default: "Predeterminado",
    languagePreference: "Preferencia de idioma",
    languageDescription: "Idioma por defecto para nuevos libros e interfaz",
    byokTitle: "BYOK (Trae tu propia clave):",
    byokDescription: "WriteMyBook usa tu clave API directamente. Nunca almacenamos tus credenciales en texto plano \u2014 están cifradas con AES-256-GCM. Pagas a Anthropic directamente por el uso de tokens.",
  },
  agentPanel: {
    apiKeyRequired: "Clave API requerida",
    apiKeyDescription: "Añade tu clave API de Anthropic para empezar a usar el agente de escritura.",
    goToSettings: "Ir a Ajustes",
  },
  workflowSelector: {
    chooseWorkflow: "Elige un flujo de trabajo:",
    selectChapter: "Selecciona un capítulo para este flujo:",
    noChapters: "Aún no hay capítulos. Crea uno primero.",
    back: "Atrás",
    start: "Iniciar",
    setup: "Configuración",
    writing: "Escritura",
    editing: "Edición",
    analysis: "Análisis",
    style: "Estilo",
    research: "Investigación",
    series: "Serie",
  },
  newBook: {
    title: "Nuevo libro",
    description: "Crea un nuevo libro para empezar a escribir",
    bookName: "Nombre del libro",
    genre: "Género",
    genrePlaceholder: "Fantasía, Ciencia ficción, Romance...",
    language: "Idioma",
    seriesOptional: "Serie (opcional)",
    noSeries: "Sin serie",
    bookNumber: "Número de libro",
    cancel: "Cancelar",
    creating: "Creando...",
    create: "Crear libro",
    bookCreated: "Libro creado",
  },
  common: {
    loading: "Cargando...",
    error: "Error",
    save: "Guardar",
    delete: "Eliminar",
    edit: "Editar",
    close: "Cerrar",
    confirm: "Confirmar",
  },
  setup: {
    title: "Configurar libro", subtitle: "Complete estos pasos para preparar su libro para escribir.",
    basics: "Básicos", basicsDesc: "Configure el nombre, género e idioma del libro",
    importStep: "Importar", importDesc: "Importe un manuscrito existente (opcional)",
    styleStep: "Estilo", styleDesc: "Capture su voz de escritura única",
    storyBible: "Biblia de la historia", storyBibleDesc: "Construya su mundo, personajes y reglas",
    architecture: "Arquitectura", architectureDesc: "Diseñe la estructura de su historia",
    doneStep: "Listo", doneDesc: "¡Todo está preparado!",
    bookName: "Nombre del libro", genre: "Género", genrePlaceholder: "Fantasía, Ciencia ficción, Romance...",
    language: "Idioma", languageHint: "Los agentes escribirán y se comunicarán en este idioma",
    descriptionOptional: "Descripción (opcional)", descriptionPlaceholder: "Un breve resumen de su libro...",
    saveAndContinue: "Guardar y continuar",
    importInfo: "Si tiene un manuscrito existente, puede importarlo ahora. Este paso es opcional -- siempre puede importar más tarde.",
    manuscriptImported: "Manuscrito importado", chaptersLoaded: "capítulos cargados",
    importMore: "Importar más", goToImport: "Ir a Importar",
    styleInfo: "Analice sus muestras de escritura para crear una huella de voz única. El agente examinará su prosa y construirá un perfil de estilo que guía al escritor fantasma.",
    fingerprintCaptured: "Huella de estilo ya capturada",
    captureStyle: "Capturar mi estilo de escritura", reCaptureStyle: "Recapturar estilo",
    bibleInfo: "Construya una biblia de la historia con su mundo, personajes, reglas y tradiciones. Esto mantiene al escritor fantasma consistente entre capítulos.",
    bibleCreated: "Biblia de la historia ya creada",
    createBible: "Crear biblia de la historia", reCreateBible: "Recrear biblia de la historia",
    archInfo: "Diseñe la estructura de su historia -- actos, capítulos, arcos argumentales y ritmo. El agente le ayudará a esbozar todo el libro.",
    archCreated: "Arquitectura ya construida",
    buildArch: "Construir arquitectura", reBuildArch: "Reconstruir arquitectura",
    setupComplete: "Configuración completa", bookReady: "Su libro está listo. Puede revisitar cualquier paso más tarde.",
    alreadyExists: "ya existe", overwriteWarning: "Ejecutar de nuevo lo sobrescribirá. ¿Continuar?",
    agentRunning: "Agente ejecutándose...", skip: "Omitir", continueStep: "Continuar",
    back: "Atrás", reCapture: "Recapturar", reCreate: "Recrear", reBuild: "Reconstruir", cancel: "Cancelar",
  },
  bookOverview: {
    settingsBtn: "Ajustes", words: "Palabras", chapters: "Capítulos", documents: "Documentos",
    completeSetup: "Complete la configuración del libro",
    setupDescription: "Configure su perfil de estilo, biblia de la historia y arquitectura para comenzar.",
    startSetup: "Iniciar configuración", addChapter: "Añadir capítulo",
    noChapters: "Aún no hay capítulos. Añada su primer capítulo para empezar a escribir.",
    colNum: "#", colTitle: "Título", colAct: "Acto", colStatus: "Estado", colWords: "Palabras", colScore: "Puntuación", colAction: "Acción",
    untitled: "Sin título", act: "Acto", edit: "Editar",
    avgBetaScore: "Puntuación beta promedio",
  },
  bookSettings: {
    title: "Ajustes del libro", subtitle: "Configure modelos de IA y preferencias de escritura",
    aiModels: "Modelos de IA", aiModelsDesc: "Elija qué modelo Claude usa cada agente",
    ghostwriter: "Escritor fantasma", ghostwriterDesc: "Escribe borradores de capítulos",
    coach: "Coach", coachDesc: "Coach de escritura y biblia de la historia",
    creative: "Creativo", creativeDesc: "Estilo, arquitectura y planificación",
    editor: "Editor", editorDesc: "Edición de desarrollo, línea y continuidad",
    betaReader: "Lector beta", betaReaderDesc: "Panel de lectores simulado",
    research: "Investigación", researchDesc: "Manuscrito, mercado y publicación",
    analyst: "Analista", analystDesc: "Estadísticas y legibilidad",
    styleSection: "Estilo", styleDesc: "Controle cuán estrictamente la IA sigue su estilo de escritura",
    styleStrictness: "Rigor de estilo", strict: "Estricto", balanced: "Equilibrado", relaxed: "Relajado",
    autoCommit: "Auto-guardar", autoCommitDesc: "Guardar automáticamente los cambios del agente",
    betaPanel: "Panel de lectores beta", betaPanelDesc: "Configure los ajustes de lectura beta virtual",
    panelSize: "Tamaño del panel", consensus: "Consenso %", convergence: "Convergencia %",
    back: "Atrás",
  },
  bookList: {
    title: "Libros", newBook: "Nuevo libro", noBooks: "Aún no hay libros",
    noBooksDesc: "Comience su viaje de escritura creando su primer libro",
    createBook: "Crear libro", words: "palabras", chapters: "capítulos",
    series: "Serie:", updated: "Actualizado", book: "libro", books: "libros",
  },
  reports: {
    title: "Informes", subtitle: "Analítica, continuidad, análisis de mercado y resumen editorial",
    analytics: "Analítica", continuity: "Continuidad", market: "Mercado", edits: "Ediciones", documents: "Documentos",
  },
  stylePage: {
    title: "Estilo de escritura", subtitle: "Su huella de voz única y análisis de estilo",
    refreshStyle: "Actualizar estilo", evolveStyle: "Evolucionar estilo",
    noProfile: "Aún no hay perfil de estilo",
    noProfileDesc: "Analice su escritura para capturar una huella de voz única que guíe al escritor fantasma.",
    captureStyle: "Analizar mi estilo de escritura", agentRunning: "Agente ejecutándose...",
  },
  seriesPage: {
    title: "Series", newSeries: "Nueva serie", noSeries: "Aún no hay series",
    noSeriesDesc: "Agrupe libros relacionados en una serie",
    createSeries: "Crear serie", books: "libros", docs: "documentos",
  },
  chapterNew: {
    title: "Nuevo capítulo", subtitle: "Añada un nuevo capítulo a su libro",
    chapterNumber: "Número de capítulo", actNumber: "Número de acto",
    titleOptional: "Título (opcional)", titlePlaceholder: "Título del capítulo...",
    cancel: "Cancelar", creating: "Creando...", create: "Crear capítulo", created: "Capítulo creado",
  },
  chaptersIndex: {
    title: "Capítulos", subtitle: "Explore y abra cualquier capítulo de su libro.", newChapter: "Nuevo capítulo",
    untitled: "Sin título", words: "palabras",
    empty: "Aún no hay capítulos", emptyDesc: "Cree su primer capítulo para empezar a escribir.", loadError: "No se pudieron cargar los capítulos. Inténtelo de nuevo.",
  },
  chapterStatuses: {
    undiscussed: "Nuevo inicio",
    discussed: "Discutido",
    planned: "Esbozado",
    drafted: "Primer borrador",
    dev_edited: "Edición profunda",
    line_edited: "Refinado",
    beta_read: "Lector probado",
    beta_passed: "Pulido",
  },
  wordTarget: {
    setTarget: "Establecer objetivo de palabras",
    popoverTitle: "Objetivo de palabras del capítulo",
    placeholder: "p. ej. 2000",
    clear: "Quitar",
    words: "palabras",
  },
  commandPalette: {
    placeholder: "Buscar comandos, capítulos, flujos...",
    chapters: "Capítulos",
    workflows: "Flujos de trabajo",
    pages: "Páginas",
    recent: "Reciente",
    noResults: "Sin resultados",
    actions: "Acciones",
  },
  wiki: {
    title: "Wiki del mundo",
    search: "Buscar entidades...",
    newEntry: "Nueva entrada",
    all: "Todos",
    characters: "Personajes",
    locations: "Lugares",
    items: "Objetos",
    events: "Eventos",
    lore: "Mitología",
    noEntries: "Aún no hay entradas",
    noEntriesDesc: "Crea entradas manualmente o deja que el agente las llene desde tu Biblia de la historia.",
    editEntry: "Editar",
    deleteEntry: "Eliminar",
    aliases: "Alias",
    description: "Descripción",
    attributes: "Atributos",
    source: "Fuente",
    populate: "Rellenar desde documentos",
    populateDesc: "Extraer personajes, lugares y mitología de tu Biblia de la historia.",
    populating: "Extrayendo entidades...",
    populated: "entidades creadas",
    noDocs: "Primero crea una Biblia de la historia.",
  },
  writingDashboard: {
    title: "Panel de escritura",
    todayWords: "Palabras hoy",
    streak: "Racha",
    weeklyAvg: "Promedio semanal",
    totalWords: "Total de palabras",
    dailyGoal: "Meta diaria",
    weeklyGoal: "Meta semanal",
    totalGoal: "Meta total",
    setGoal: "Establecer meta",
    last30Days: "Últimos 30 días",
    days: "días",
    noData: "Aún no hay datos de escritura. ¡Empieza a escribir para ver tu progreso!",
  },
  journey: {
    chooseJourney: "Elige tu recorrido",
    chooseJourneyDesc: "Selecciona un camino de autoría para guiar tu proceso de escritura.",
    changeJourney: "Cambiar recorrido",
    switchConfirmTitle: "¿Cambiar recorrido?",
    switchConfirmDesc: "Cambiar de recorrido actualizará tu lista de verificación. Tu trabajo no se verá afectado.",
    switchConfirmAction: "Cambiar",
    cancel: "Cancelar",
    recommended: "Recomendado",
    steps: "Pasos",
    stepOf: "de",
    allComplete: "¡Recorrido completado!",
    allCompleteDesc: "Has completado todos los pasos de este recorrido. ¡Felicitaciones!",
    celebrationBanner: "¡Tu recorrido de manuscrito está completo!",
    noBannerYet: "Sin recorrido seleccionado",
    noBannerYetDesc: "Elige un recorrido para ver tu lista de progreso.",
    nextStep: "Siguiente paso",
    startButton: "Comenzar",
  },
};

const FR: UIStrings = {
  nav: {
    dashboard: "Tableau de bord",
    books: "Livres",
    series: "Séries",
    navigation: "Navigation",
    overview: "Aperçu",
    documents: "Documents",
    editorial: "Éditorial",
    import: "Importer",
    export: "Exporter",
    reports: "Rapports",
    style: "Style",
    setup: "Configuration",
    chapters: "Chapitres",
    addChapter: "Ajouter un chapitre",
    analytics: "Analytique",
    settings: "Paramètres",
    account: "Compte",
    writingPlatform: "Plateforme d'écriture",
    sectionSetup: "Premiers pas",
    sectionWriting: "Écriture",
    sectionEditing: "Peaufinage",
    sectionAnalysis: "Aperçus",
    sectionPublish: "Publier",
    sectionTools: "Outils",
    nextStep: "Prochaine étape",
    library: "Bibliothèque",
    transfer: "Transfert",
  },
  header: {
    toggleSidebar: "Afficher/masquer la barre latérale",
    toggleAgent: "Afficher/masquer le panneau agent",
    new: "Nouveau",
  },
  dashboard: {
    welcomeBack: "Bon retour",
    writer: "Écrivain",
    yourWorkspace: "Votre espace d'écriture",
    totalBooks: "Total des livres",
    totalWords: "Total des mots",
    totalChapters: "Total des chapitres",
    totalSeries: "Séries",
    recentBooks: "Livres récents",
    createBook: "Créer un livre",
    noBooksYet: "Pas encore de livres",
    noBooksDescription: "Créez votre premier livre pour commencer",
    words: "mots",
    chapters: "chapitres",
    updated: "Mis à jour",
    continueWriting: "Reprendre là où vous en étiez",
    lastEdited: "Dernière modification",
    resumeChapter: "Reprendre",
    recentSessions: "Sessions d'agents récentes",
    noSessions: "Pas encore de sessions d'agents",
    writingActivity: "Activité d'écriture",
    wordsThisWeek: "mots cette semaine",
    pendingAlerts: "Alertes",
    noAlerts: "Aucune alerte en attente",
    quickActions: "Actions rapides",
    startWriting: "Commencer à écrire",
    importManuscript: "Importer un manuscrit",
    viewAll: "Tout voir",
  },
  settings: {
    title: "Paramètres",
    subtitle: "Gérez vos clés API et préférences",
    apiKeys: "Clés API",
    apiKeysDescription: "Apportez votre propre clé (BYOK) \u2014 vos clés API sont chiffrées au repos",
    addKey: "Ajouter une clé",
    provider: "Fournisseur",
    labelOptional: "Libellé (optionnel)",
    apiKey: "Clé API",
    validating: "Validation...",
    cancel: "Annuler",
    noKeysTitle: "Aucune clé API configurée",
    noKeysDescription: "Ajoutez-en une pour utiliser les agents IA.",
    default: "Par défaut",
    languagePreference: "Préférence de langue",
    languageDescription: "Langue par défaut pour les nouveaux livres et l'interface",
    byokTitle: "BYOK (Apportez votre propre clé) :",
    byokDescription: "WriteMyBook utilise votre clé API directement. Nous ne stockons jamais vos identifiants en clair \u2014 ils sont chiffrés avec AES-256-GCM. Vous payez Anthropic directement pour l'utilisation des tokens.",
  },
  agentPanel: {
    apiKeyRequired: "Clé API requise",
    apiKeyDescription: "Ajoutez votre clé API Anthropic pour commencer à utiliser l'agent d'écriture.",
    goToSettings: "Aller aux paramètres",
  },
  workflowSelector: {
    chooseWorkflow: "Choisissez un flux de travail :",
    selectChapter: "Sélectionnez un chapitre pour ce flux :",
    noChapters: "Pas encore de chapitres. Créez-en un d'abord.",
    back: "Retour",
    start: "Démarrer",
    setup: "Configuration",
    writing: "Écriture",
    editing: "Édition",
    analysis: "Analyse",
    style: "Style",
    research: "Recherche",
    series: "Série",
  },
  newBook: {
    title: "Nouveau livre",
    description: "Créez un nouveau livre pour commencer à écrire",
    bookName: "Nom du livre",
    genre: "Genre",
    genrePlaceholder: "Fantaisie, Science-fiction, Romance...",
    language: "Langue",
    seriesOptional: "Série (optionnel)",
    noSeries: "Aucune série",
    bookNumber: "Numéro du livre",
    cancel: "Annuler",
    creating: "Création...",
    create: "Créer un livre",
    bookCreated: "Livre créé",
  },
  common: {
    loading: "Chargement...",
    error: "Erreur",
    save: "Enregistrer",
    delete: "Supprimer",
    edit: "Modifier",
    close: "Fermer",
    confirm: "Confirmer",
  },
  setup: {
    title: "Configuration du livre", subtitle: "Complétez ces étapes pour préparer votre livre à l'écriture.",
    basics: "Bases", basicsDesc: "Définissez le nom, le genre et la langue du livre",
    importStep: "Importer", importDesc: "Importez un manuscrit existant (optionnel)",
    styleStep: "Style", styleDesc: "Capturez votre voix d'écriture unique",
    storyBible: "Bible de l'histoire", storyBibleDesc: "Construisez votre monde, personnages et règles",
    architecture: "Architecture", architectureDesc: "Concevez la structure de votre histoire",
    doneStep: "Terminé", doneDesc: "Tout est prêt !",
    bookName: "Nom du livre", genre: "Genre", genrePlaceholder: "Fantaisie, Science-fiction, Romance...",
    language: "Langue", languageHint: "Les agents écriront et communiqueront dans cette langue",
    descriptionOptional: "Description (optionnel)", descriptionPlaceholder: "Un bref résumé de votre livre...",
    saveAndContinue: "Enregistrer et continuer",
    importInfo: "Si vous avez un manuscrit existant, vous pouvez l'importer maintenant. Cette étape est optionnelle -- vous pouvez toujours importer plus tard.",
    manuscriptImported: "Manuscrit importé", chaptersLoaded: "chapitres chargés",
    importMore: "Importer plus", goToImport: "Aller à l'import",
    styleInfo: "Analysez vos échantillons d'écriture pour créer une empreinte vocale unique. L'agent examinera votre prose et construira un profil de style qui guide le nègre littéraire.",
    fingerprintCaptured: "Empreinte de style déjà capturée",
    captureStyle: "Capturer mon style d'écriture", reCaptureStyle: "Recapturer le style",
    bibleInfo: "Construisez une bible de l'histoire avec votre monde, personnages, règles et traditions. Cela maintient le nègre littéraire cohérent entre les chapitres.",
    bibleCreated: "Bible de l'histoire déjà créée",
    createBible: "Créer la bible de l'histoire", reCreateBible: "Recréer la bible de l'histoire",
    archInfo: "Concevez la structure de votre histoire -- actes, chapitres, arcs narratifs et rythme. L'agent vous aidera à esquisser tout le livre.",
    archCreated: "Architecture déjà construite",
    buildArch: "Construire l'architecture", reBuildArch: "Reconstruire l'architecture",
    setupComplete: "Configuration terminée", bookReady: "Votre livre est prêt. Vous pouvez revisiter n'importe quelle étape plus tard.",
    alreadyExists: "existe déjà", overwriteWarning: "Relancer écrasera le contenu. Continuer ?",
    agentRunning: "Agent en cours...", skip: "Passer", continueStep: "Continuer",
    back: "Retour", reCapture: "Recapturer", reCreate: "Recréer", reBuild: "Reconstruire", cancel: "Annuler",
  },
  bookOverview: {
    settingsBtn: "Paramètres", words: "Mots", chapters: "Chapitres", documents: "Documents",
    completeSetup: "Terminer la configuration du livre",
    setupDescription: "Configurez votre profil de style, bible de l'histoire et architecture pour commencer.",
    startSetup: "Commencer la configuration", addChapter: "Ajouter un chapitre",
    noChapters: "Pas encore de chapitres. Ajoutez votre premier chapitre pour commencer à écrire.",
    colNum: "#", colTitle: "Titre", colAct: "Acte", colStatus: "Statut", colWords: "Mots", colScore: "Score", colAction: "Action",
    untitled: "Sans titre", act: "Acte", edit: "Modifier",
    avgBetaScore: "Score beta moyen",
  },
  bookSettings: {
    title: "Paramètres du livre", subtitle: "Configurez les modèles IA et les préférences d'écriture",
    aiModels: "Modèles IA", aiModelsDesc: "Choisissez quel modèle Claude chaque agent utilise",
    ghostwriter: "Nègre littéraire", ghostwriterDesc: "Écrit les brouillons de chapitres",
    coach: "Coach", coachDesc: "Coach d'écriture et bible de l'histoire",
    creative: "Créatif", creativeDesc: "Style, architecture et planification",
    editor: "Éditeur", editorDesc: "Édition de développement, de ligne et continuité",
    betaReader: "Lecteur bêta", betaReaderDesc: "Panel de lecteurs simulé",
    research: "Recherche", researchDesc: "Manuscrit, marché et publication",
    analyst: "Analyste", analystDesc: "Statistiques et lisibilité",
    styleSection: "Style", styleDesc: "Contrôlez à quel point l'IA suit strictement votre style d'écriture",
    styleStrictness: "Rigueur du style", strict: "Strict", balanced: "Équilibré", relaxed: "Détendu",
    autoCommit: "Auto-sauvegarde", autoCommitDesc: "Sauvegarder automatiquement les modifications de l'agent",
    betaPanel: "Panel de lecteurs bêta", betaPanelDesc: "Configurez les paramètres de lecture bêta virtuelle",
    panelSize: "Taille du panel", consensus: "Consensus %", convergence: "Convergence %",
    back: "Retour",
  },
  bookList: {
    title: "Livres", newBook: "Nouveau livre", noBooks: "Pas encore de livres",
    noBooksDesc: "Commencez votre voyage d'écriture en créant votre premier livre",
    createBook: "Créer un livre", words: "mots", chapters: "chapitres",
    series: "Série :", updated: "Mis à jour", book: "livre", books: "livres",
  },
  reports: {
    title: "Rapports", subtitle: "Analytique, continuité, analyse de marché et aperçu éditorial",
    analytics: "Analytique", continuity: "Continuité", market: "Marché", edits: "Éditions", documents: "Documents",
  },
  stylePage: {
    title: "Style d'écriture", subtitle: "Votre empreinte vocale unique et analyse de style",
    refreshStyle: "Actualiser le style", evolveStyle: "Faire évoluer le style",
    noProfile: "Pas encore de profil de style",
    noProfileDesc: "Analysez votre écriture pour capturer une empreinte vocale unique qui guide le nègre littéraire.",
    captureStyle: "Analyser mon style d'écriture", agentRunning: "Agent en cours...",
  },
  seriesPage: {
    title: "Séries", newSeries: "Nouvelle série", noSeries: "Pas encore de séries",
    noSeriesDesc: "Regroupez les livres liés dans une série",
    createSeries: "Créer une série", books: "livres", docs: "documents",
  },
  chapterNew: {
    title: "Nouveau chapitre", subtitle: "Ajoutez un nouveau chapitre à votre livre",
    chapterNumber: "Numéro de chapitre", actNumber: "Numéro d'acte",
    titleOptional: "Titre (optionnel)", titlePlaceholder: "Titre du chapitre...",
    cancel: "Annuler", creating: "Création...", create: "Créer un chapitre", created: "Chapitre créé",
  },
  chaptersIndex: {
    title: "Chapitres", subtitle: "Parcourez et ouvrez n'importe quel chapitre de votre livre.", newChapter: "Nouveau chapitre",
    untitled: "Sans titre", words: "mots",
    empty: "Aucun chapitre pour l'instant", emptyDesc: "Créez votre premier chapitre pour commencer à écrire.", loadError: "Impossible de charger les chapitres. Veuillez réessayer.",
  },
  chapterStatuses: {
    undiscussed: "Nouveau départ",
    discussed: "Discuté",
    planned: "Esquissé",
    drafted: "Premier jet",
    dev_edited: "Édition profonde",
    line_edited: "Affiné",
    beta_read: "Testé par lecteur",
    beta_passed: "Peaufiné",
  },
  wordTarget: {
    setTarget: "Définir l'objectif de mots",
    popoverTitle: "Objectif de mots du chapitre",
    placeholder: "p. ex. 2000",
    clear: "Effacer",
    words: "mots",
  },
  commandPalette: {
    placeholder: "Rechercher commandes, chapitres, workflows...",
    chapters: "Chapitres",
    workflows: "Workflows",
    pages: "Pages",
    recent: "Récent",
    noResults: "Aucun résultat",
    actions: "Actions",
  },
  wiki: {
    title: "Wiki du monde",
    search: "Rechercher des entités...",
    newEntry: "Nouvelle entrée",
    all: "Tout",
    characters: "Personnages",
    locations: "Lieux",
    items: "Objets",
    events: "Événements",
    lore: "Mythologie",
    noEntries: "Pas encore d'entrées",
    noEntriesDesc: "Créez des entrées manuellement ou laissez l'agent les remplir depuis votre Bible de l'histoire.",
    editEntry: "Modifier",
    deleteEntry: "Supprimer",
    aliases: "Alias",
    description: "Description",
    attributes: "Attributs",
    source: "Source",
    populate: "Remplir à partir des documents",
    populateDesc: "Extraire les personnages, lieux et mythologie de votre Bible de l'histoire.",
    populating: "Extraction des entités...",
    populated: "entités créées",
    noDocs: "Créez d'abord une Bible de l'histoire.",
  },
  writingDashboard: {
    title: "Tableau de bord d'écriture",
    todayWords: "Mots aujourd'hui",
    streak: "Série",
    weeklyAvg: "Moyenne hebdomadaire",
    totalWords: "Total des mots",
    dailyGoal: "Objectif quotidien",
    weeklyGoal: "Objectif hebdomadaire",
    totalGoal: "Objectif total",
    setGoal: "Définir un objectif",
    last30Days: "30 derniers jours",
    days: "jours",
    noData: "Pas encore de données d'écriture. Commencez à écrire pour voir vos progrès !",
  },
  journey: {
    chooseJourney: "Choisissez votre parcours",
    chooseJourneyDesc: "Sélectionnez un chemin d'écriture pour guider votre processus.",
    changeJourney: "Changer de parcours",
    switchConfirmTitle: "Changer de parcours ?",
    switchConfirmDesc: "Changer de parcours mettra à jour votre liste de vérification. Votre travail n'est pas affecté.",
    switchConfirmAction: "Changer",
    cancel: "Annuler",
    recommended: "Recommandé",
    steps: "Étapes",
    stepOf: "sur",
    allComplete: "Parcours terminé !",
    allCompleteDesc: "Vous avez terminé toutes les étapes de ce parcours. Félicitations !",
    celebrationBanner: "Votre parcours de manuscrit est terminé !",
    noBannerYet: "Aucun parcours sélectionné",
    noBannerYetDesc: "Choisissez un parcours pour voir votre liste de progression.",
    nextStep: "Prochaine étape",
    startButton: "Commencer",
  },
};

const RU: UIStrings = {
  nav: {
    dashboard: "Панель",
    books: "Книги",
    series: "Серии",
    navigation: "Навигация",
    overview: "Обзор",
    documents: "Документы",
    editorial: "Редактура",
    import: "Импорт",
    export: "Экспорт",
    reports: "Отчёты",
    style: "Стиль",
    setup: "Настройка",
    chapters: "Главы",
    addChapter: "Добавить главу",
    analytics: "Аналитика",
    settings: "Настройки",
    account: "Аккаунт",
    writingPlatform: "Платформа для писателей",
    sectionSetup: "Начало работы",
    sectionWriting: "Написание",
    sectionEditing: "Шлифовка",
    sectionAnalysis: "Аналитика",
    sectionPublish: "Публикация",
    sectionTools: "Инструменты",
    nextStep: "Следующий шаг",
    library: "Библиотека",
    transfer: "Передача",
  },
  header: {
    toggleSidebar: "Показать/скрыть боковую панель",
    toggleAgent: "Показать/скрыть панель агента",
    new: "Новый",
  },
  dashboard: {
    welcomeBack: "С возвращением",
    writer: "Писатель",
    yourWorkspace: "Ваше рабочее пространство",
    totalBooks: "Всего книг",
    totalWords: "Всего слов",
    totalChapters: "Всего глав",
    totalSeries: "Серии",
    recentBooks: "Недавние книги",
    createBook: "Создать книгу",
    noBooksYet: "Пока нет книг",
    noBooksDescription: "Создайте свою первую книгу, чтобы начать",
    words: "слов",
    chapters: "глав",
    updated: "Обновлено",
    continueWriting: "Продолжить с того места, где остановились",
    lastEdited: "Последнее редактирование",
    resumeChapter: "Продолжить",
    recentSessions: "Недавние сессии агентов",
    noSessions: "Пока нет сессий агентов",
    writingActivity: "Активность письма",
    wordsThisWeek: "слов за неделю",
    pendingAlerts: "Уведомления",
    noAlerts: "Нет ожидающих уведомлений",
    quickActions: "Быстрые действия",
    startWriting: "Начать писать",
    importManuscript: "Импортировать рукопись",
    viewAll: "Показать все",
  },
  settings: {
    title: "Настройки",
    subtitle: "Управление API-ключами и предпочтениями",
    apiKeys: "API-ключи",
    apiKeysDescription: "Собственный ключ (BYOK) \u2014 ваши API-ключи зашифрованы при хранении",
    addKey: "Добавить ключ",
    provider: "Провайдер",
    labelOptional: "Метка (необязательно)",
    apiKey: "API-ключ",
    validating: "Проверка...",
    cancel: "Отмена",
    noKeysTitle: "API-ключи не настроены",
    noKeysDescription: "Добавьте ключ, чтобы начать использовать ИИ-агентов.",
    default: "По умолчанию",
    languagePreference: "Языковые предпочтения",
    languageDescription: "Язык по умолчанию для новых книг и интерфейса",
    byokTitle: "BYOK (Собственный ключ):",
    byokDescription: "WriteMyBook использует ваш API-ключ напрямую. Мы никогда не храним ваши учётные данные в открытом виде \u2014 они зашифрованы AES-256-GCM. Вы платите Anthropic напрямую за использование токенов.",
  },
  agentPanel: {
    apiKeyRequired: "Требуется API-ключ",
    apiKeyDescription: "Добавьте API-ключ Anthropic, чтобы начать использовать агента-писателя.",
    goToSettings: "Перейти в настройки",
  },
  workflowSelector: {
    chooseWorkflow: "Выберите рабочий процесс:",
    selectChapter: "Выберите главу для этого процесса:",
    noChapters: "Глав пока нет. Сначала создайте главу.",
    back: "Назад",
    start: "Запустить",
    setup: "Настройка",
    writing: "Написание",
    editing: "Редактирование",
    analysis: "Анализ",
    style: "Стиль",
    research: "Исследование",
    series: "Серия",
  },
  newBook: {
    title: "Новая книга",
    description: "Создайте новую книгу, чтобы начать писать",
    bookName: "Название книги",
    genre: "Жанр",
    genrePlaceholder: "Фэнтези, Научная фантастика, Любовный роман...",
    language: "Язык",
    seriesOptional: "Серия (необязательно)",
    noSeries: "Без серии",
    bookNumber: "Номер книги",
    cancel: "Отмена",
    creating: "Создание...",
    create: "Создать книгу",
    bookCreated: "Книга создана",
  },
  common: {
    loading: "Загрузка...",
    error: "Ошибка",
    save: "Сохранить",
    delete: "Удалить",
    edit: "Редактировать",
    close: "Закрыть",
    confirm: "Подтвердить",
  },
  setup: {
    title: "Настройка книги", subtitle: "Выполните эти шаги, чтобы подготовить книгу к написанию.",
    basics: "Основы", basicsDesc: "Задайте название, жанр и язык книги",
    importStep: "Импорт", importDesc: "Импортируйте существующую рукопись (необязательно)",
    styleStep: "Стиль", styleDesc: "Зафиксируйте ваш уникальный голос",
    storyBible: "Библия истории", storyBibleDesc: "Постройте мир, персонажей и правила",
    architecture: "Архитектура", architectureDesc: "Спроектируйте структуру истории",
    doneStep: "Готово", doneDesc: "Всё готово!",
    bookName: "Название книги", genre: "Жанр", genrePlaceholder: "Фэнтези, Научная фантастика, Любовный роман...",
    language: "Язык", languageHint: "Агенты будут писать и общаться на этом языке",
    descriptionOptional: "Описание (необязательно)", descriptionPlaceholder: "Краткое описание вашей книги...",
    saveAndContinue: "Сохранить и продолжить",
    importInfo: "Если у вас есть существующая рукопись, вы можете импортировать её сейчас. Этот шаг необязателен -- вы всегда можете импортировать позже.",
    manuscriptImported: "Рукопись импортирована", chaptersLoaded: "глав загружено",
    importMore: "Импортировать ещё", goToImport: "Перейти к импорту",
    styleInfo: "Проанализируйте ваши образцы письма, чтобы создать уникальный отпечаток голоса. Агент изучит вашу прозу и создаст профиль стиля, который направляет писателя.",
    fingerprintCaptured: "Отпечаток стиля уже зафиксирован",
    captureStyle: "Зафиксировать мой стиль письма", reCaptureStyle: "Перезафиксировать стиль",
    bibleInfo: "Создайте библию истории с вашим миром, персонажами, правилами и легендами. Это поддерживает согласованность писателя между главами.",
    bibleCreated: "Библия истории уже создана",
    createBible: "Создать библию истории", reCreateBible: "Пересоздать библию истории",
    archInfo: "Спроектируйте структуру истории -- акты, главы, сюжетные арки и темп. Агент поможет вам набросать всю книгу.",
    archCreated: "Архитектура уже построена",
    buildArch: "Построить архитектуру", reBuildArch: "Перестроить архитектуру",
    setupComplete: "Настройка завершена", bookReady: "Ваша книга готова. Вы можете вернуться к любому шагу позже.",
    alreadyExists: "уже существует", overwriteWarning: "Повторный запуск перезапишет. Продолжить?",
    agentRunning: "Агент работает...", skip: "Пропустить", continueStep: "Продолжить",
    back: "Назад", reCapture: "Перезафиксировать", reCreate: "Пересоздать", reBuild: "Перестроить", cancel: "Отмена",
  },
  bookOverview: {
    settingsBtn: "Настройки", words: "Слова", chapters: "Главы", documents: "Документы",
    completeSetup: "Завершите настройку книги",
    setupDescription: "Настройте профиль стиля, библию истории и архитектуру, чтобы начать.",
    startSetup: "Начать настройку", addChapter: "Добавить главу",
    noChapters: "Глав пока нет. Добавьте первую главу, чтобы начать писать.",
    colNum: "#", colTitle: "Название", colAct: "Акт", colStatus: "Статус", colWords: "Слова", colScore: "Оценка", colAction: "Действие",
    untitled: "Без названия", act: "Акт", edit: "Редактировать",
    avgBetaScore: "Средняя бета-оценка",
  },
  bookSettings: {
    title: "Настройки книги", subtitle: "Настройте модели ИИ и параметры письма",
    aiModels: "Модели ИИ", aiModelsDesc: "Выберите, какую модель Claude использует каждый агент",
    ghostwriter: "Писатель", ghostwriterDesc: "Пишет черновики глав",
    coach: "Тренер", coachDesc: "Тренер по письму и библия истории",
    creative: "Творческий", creativeDesc: "Стиль, архитектура и планирование",
    editor: "Редактор", editorDesc: "Развивающая, построчная редактура и непрерывность",
    betaReader: "Бета-читатель", betaReaderDesc: "Симулированная панель читателей",
    research: "Исследование", researchDesc: "Рукопись, рынок и издательство",
    analyst: "Аналитик", analystDesc: "Статистика и читаемость",
    styleSection: "Стиль", styleDesc: "Контролируйте, насколько строго ИИ следует вашему стилю письма",
    styleStrictness: "Строгость стиля", strict: "Строго", balanced: "Сбалансированно", relaxed: "Свободно",
    autoCommit: "Автосохранение", autoCommitDesc: "Автоматически сохранять изменения агента",
    betaPanel: "Панель бета-читателей", betaPanelDesc: "Настройте параметры виртуального бета-чтения",
    panelSize: "Размер панели", consensus: "Консенсус %", convergence: "Конвергенция %",
    back: "Назад",
  },
  bookList: {
    title: "Книги", newBook: "Новая книга", noBooks: "Книг пока нет",
    noBooksDesc: "Начните писательский путь, создав свою первую книгу",
    createBook: "Создать книгу", words: "слов", chapters: "глав",
    series: "Серия:", updated: "Обновлено", book: "книга", books: "книг",
  },
  reports: {
    title: "Отчёты", subtitle: "Аналитика, непрерывность, анализ рынка и обзор редактуры",
    analytics: "Аналитика", continuity: "Непрерывность", market: "Рынок", edits: "Редактура", documents: "Документы",
  },
  stylePage: {
    title: "Стиль письма", subtitle: "Ваш уникальный отпечаток голоса и анализ стиля",
    refreshStyle: "Обновить стиль", evolveStyle: "Развить стиль",
    noProfile: "Профиль стиля ещё не создан",
    noProfileDesc: "Проанализируйте ваше письмо, чтобы зафиксировать уникальный отпечаток голоса, который направляет писателя.",
    captureStyle: "Проанализировать мой стиль письма", agentRunning: "Агент работает...",
  },
  seriesPage: {
    title: "Серии", newSeries: "Новая серия", noSeries: "Серий пока нет",
    noSeriesDesc: "Объедините связанные книги в серию",
    createSeries: "Создать серию", books: "книг", docs: "документов",
  },
  chapterNew: {
    title: "Новая глава", subtitle: "Добавьте новую главу в книгу",
    chapterNumber: "Номер главы", actNumber: "Номер акта",
    titleOptional: "Название (необязательно)", titlePlaceholder: "Название главы...",
    cancel: "Отмена", creating: "Создание...", create: "Создать главу", created: "Глава создана",
  },
  chaptersIndex: {
    title: "Главы", subtitle: "Просматривайте и открывайте любую главу вашей книги.", newChapter: "Новая глава",
    untitled: "Без названия", words: "слов",
    empty: "Пока нет глав", emptyDesc: "Создайте первую главу, чтобы начать писать.", loadError: "Не удалось загрузить главы. Попробуйте еще раз.",
  },
  chapterStatuses: {
    undiscussed: "Новое начало",
    discussed: "Обсуждено",
    planned: "Набросано",
    drafted: "Первый черновик",
    dev_edited: "Глубокая правка",
    line_edited: "Уточнено",
    beta_read: "Протестировано",
    beta_passed: "Отполировано",
  },
  wordTarget: {
    setTarget: "Задать цель по словам",
    popoverTitle: "Цель по словам для главы",
    placeholder: "напр. 2000",
    clear: "Убрать",
    words: "слов",
  },
  commandPalette: {
    placeholder: "Поиск команд, глав, процессов...",
    chapters: "Главы",
    workflows: "Процессы",
    pages: "Страницы",
    recent: "Недавнее",
    noResults: "Ничего не найдено",
    actions: "Действия",
  },
  wiki: {
    title: "Вики мира",
    search: "Поиск сущностей...",
    newEntry: "Новая запись",
    all: "Все",
    characters: "Персонажи",
    locations: "Локации",
    items: "Предметы",
    events: "События",
    lore: "Мифология",
    noEntries: "Записей пока нет",
    noEntriesDesc: "Создайте записи вручную или позвольте агенту заполнить их из Библии истории.",
    editEntry: "Редактировать",
    deleteEntry: "Удалить",
    aliases: "Псевдонимы",
    description: "Описание",
    attributes: "Атрибуты",
    source: "Источник",
    populate: "Заполнить из документов",
    populateDesc: "Извлечь персонажей, места и мифологию из Библии истории.",
    populating: "Извлечение сущностей...",
    populated: "сущностей создано",
    noDocs: "Сначала создайте Библию истории.",
  },
  writingDashboard: {
    title: "Панель писателя",
    todayWords: "Слов сегодня",
    streak: "Серия дней",
    weeklyAvg: "Среднее за неделю",
    totalWords: "Всего слов",
    dailyGoal: "Дневная цель",
    weeklyGoal: "Недельная цель",
    totalGoal: "Общая цель",
    setGoal: "Установить цель",
    last30Days: "Последние 30 дней",
    days: "дней",
    noData: "Данных о писании пока нет. Начните писать, чтобы увидеть прогресс!",
  },
  journey: {
    chooseJourney: "Выберите путь",
    chooseJourneyDesc: "Выберите авторский маршрут для вашего процесса написания.",
    changeJourney: "Сменить путь",
    switchConfirmTitle: "Сменить путь?",
    switchConfirmDesc: "Смена пути обновит ваш контрольный список. Ваша работа не затрагивается.",
    switchConfirmAction: "Сменить",
    cancel: "Отмена",
    recommended: "Рекомендовано",
    steps: "Шаги",
    stepOf: "из",
    allComplete: "Путь завершён!",
    allCompleteDesc: "Вы выполнили все шаги этого пути. Поздравляем!",
    celebrationBanner: "Ваш путь рукописи завершён!",
    noBannerYet: "Путь не выбран",
    noBannerYetDesc: "Выберите путь, чтобы увидеть контрольный список прогресса.",
    nextStep: "Следующий шаг",
    startButton: "Начать",
  },
};

const ZH: UIStrings = {
  nav: {
    dashboard: "控制面板",
    books: "书籍",
    series: "系列",
    navigation: "导航",
    overview: "概览",
    documents: "文档",
    editorial: "编辑",
    import: "导入",
    export: "导出",
    reports: "报告",
    style: "风格",
    setup: "设置",
    chapters: "章节",
    addChapter: "添加章节",
    analytics: "分析",
    settings: "设置",
    account: "账户",
    writingPlatform: "写作平台",
    sectionSetup: "入门",
    sectionWriting: "写作",
    sectionEditing: "打磨",
    sectionAnalysis: "洞察",
    sectionPublish: "出版",
    sectionTools: "工具",
    nextStep: "下一步",
    library: "资料库",
    transfer: "导入导出",
  },
  header: {
    toggleSidebar: "切换侧边栏",
    toggleAgent: "切换代理面板",
    new: "新建",
  },
  dashboard: {
    welcomeBack: "欢迎回来",
    writer: "作者",
    yourWorkspace: "您的写作工作区",
    totalBooks: "书籍总数",
    totalWords: "总字数",
    totalChapters: "章节总数",
    totalSeries: "系列",
    recentBooks: "最近的书籍",
    createBook: "创建书籍",
    noBooksYet: "还没有书籍",
    noBooksDescription: "创建您的第一本书开始写作",
    words: "字",
    chapters: "章",
    updated: "更新于",
    continueWriting: "继续上次的工作",
    lastEdited: "最后编辑",
    resumeChapter: "继续",
    recentSessions: "最近的代理会话",
    noSessions: "暂无代理会话",
    writingActivity: "写作活动",
    wordsThisWeek: "本周字数",
    pendingAlerts: "提醒",
    noAlerts: "没有待处理的提醒",
    quickActions: "快捷操作",
    startWriting: "开始写作",
    importManuscript: "导入手稿",
    viewAll: "查看全部",
  },
  settings: {
    title: "设置",
    subtitle: "管理您的API密钥和偏好设置",
    apiKeys: "API密钥",
    apiKeysDescription: "自带密钥 (BYOK) \u2014 您的API密钥已加密存储",
    addKey: "添加密钥",
    provider: "提供商",
    labelOptional: "标签（可选）",
    apiKey: "API密钥",
    validating: "验证中...",
    cancel: "取消",
    noKeysTitle: "未配置API密钥",
    noKeysDescription: "添加一个密钥以开始使用AI代理。",
    default: "默认",
    languagePreference: "语言偏好",
    languageDescription: "新书和界面的默认语言",
    byokTitle: "BYOK（自带密钥）：",
    byokDescription: "WriteMyBook直接使用您的API密钥。我们从不以明文存储您的凭据 \u2014 它们使用AES-256-GCM加密。您直接向Anthropic支付令牌使用费用。",
  },
  agentPanel: {
    apiKeyRequired: "需要API密钥",
    apiKeyDescription: "添加您的Anthropic API密钥以开始使用写作代理。",
    goToSettings: "前往设置",
  },
  workflowSelector: {
    chooseWorkflow: "选择一个工作流：",
    selectChapter: "为此工作流选择一个章节：",
    noChapters: "还没有章节。请先创建一个章节。",
    back: "返回",
    start: "开始",
    setup: "设置",
    writing: "写作",
    editing: "编辑",
    analysis: "分析",
    style: "风格",
    research: "研究",
    series: "系列",
  },
  newBook: {
    title: "新书",
    description: "创建一本新书开始写作",
    bookName: "书名",
    genre: "类型",
    genrePlaceholder: "奇幻、科幻、言情...",
    language: "语言",
    seriesOptional: "系列（可选）",
    noSeries: "无系列",
    bookNumber: "书号",
    cancel: "取消",
    creating: "创建中...",
    create: "创建书籍",
    bookCreated: "书籍已创建",
  },
  common: {
    loading: "加载中...",
    error: "错误",
    save: "保存",
    delete: "删除",
    edit: "编辑",
    close: "关闭",
    confirm: "确认",
  },
  setup: {
    title: "书籍设置", subtitle: "完成这些步骤，为您的书做好写作准备。",
    basics: "基础", basicsDesc: "设置书籍的名称、类型和语言",
    importStep: "导入", importDesc: "导入现有稿件（可选）",
    styleStep: "风格", styleDesc: "捕捉您独特的写作声音",
    storyBible: "故事圣经", storyBibleDesc: "构建您的世界、角色和规则",
    architecture: "架构", architectureDesc: "设计您的故事结构",
    doneStep: "完成", doneDesc: "一切就绪！",
    bookName: "书名", genre: "类型", genrePlaceholder: "奇幻、科幻、言情...",
    language: "语言", languageHint: "代理将使用此语言进行写作和交流",
    descriptionOptional: "描述（可选）", descriptionPlaceholder: "您的书的简要摘要...",
    saveAndContinue: "保存并继续",
    importInfo: "如果您有现有稿件，可以现在导入。此步骤是可选的——您随时可以稍后导入。",
    manuscriptImported: "稿件已导入", chaptersLoaded: "章节已加载",
    importMore: "导入更多", goToImport: "前往导入",
    styleInfo: "分析您的写作样本，创建独特的声音指纹。代理将检查您的散文并构建指导代笔人的风格档案。",
    fingerprintCaptured: "风格指纹已捕捉",
    captureStyle: "捕捉我的写作风格", reCaptureStyle: "重新捕捉风格",
    bibleInfo: "用您的世界、角色、规则和传说构建故事圣经。这使代笔人在各章之间保持一致。",
    bibleCreated: "故事圣经已创建",
    createBible: "创建故事圣经", reCreateBible: "重新创建故事圣经",
    archInfo: "设计您的故事结构——幕、章、情节弧和节奏。代理将帮助您勾勒整本书。",
    archCreated: "架构已构建",
    buildArch: "构建架构", reBuildArch: "重新构建架构",
    setupComplete: "设置完成", bookReady: "您的书已准备就绪。您可以稍后重新访问任何设置步骤。",
    alreadyExists: "已存在", overwriteWarning: "重新运行将覆盖它。继续？",
    agentRunning: "代理运行中...", skip: "跳过", continueStep: "继续",
    back: "返回", reCapture: "重新捕捉", reCreate: "重新创建", reBuild: "重新构建", cancel: "取消",
  },
  bookOverview: {
    settingsBtn: "设置", words: "字数", chapters: "章节", documents: "文档",
    completeSetup: "完成书籍设置",
    setupDescription: "设置您的风格档案、故事圣经和架构以开始。",
    startSetup: "开始设置", addChapter: "添加章节",
    noChapters: "还没有章节。添加您的第一个章节开始写作。",
    colNum: "#", colTitle: "标题", colAct: "幕", colStatus: "状态", colWords: "字数", colScore: "评分", colAction: "操作",
    untitled: "无标题", act: "幕", edit: "编辑",
    avgBetaScore: "平均测试评分",
  },
  bookSettings: {
    title: "书籍设置", subtitle: "配置AI模型和写作偏好",
    aiModels: "AI模型", aiModelsDesc: "选择每个代理使用的Claude模型",
    ghostwriter: "代笔人", ghostwriterDesc: "撰写章节草稿",
    coach: "教练", coachDesc: "写作教练和故事圣经",
    creative: "创意", creativeDesc: "风格、架构和规划",
    editor: "编辑", editorDesc: "发展编辑、行编辑和连续性",
    betaReader: "测试读者", betaReaderDesc: "模拟读者面板",
    research: "研究", researchDesc: "稿件、市场和出版",
    analyst: "分析师", analystDesc: "统计和可读性",
    styleSection: "风格", styleDesc: "控制AI遵循您写作风格的严格程度",
    styleStrictness: "风格严格度", strict: "严格", balanced: "平衡", relaxed: "宽松",
    autoCommit: "自动保存", autoCommitDesc: "自动保存代理的更改",
    betaPanel: "测试读者面板", betaPanelDesc: "配置虚拟测试读者设置",
    panelSize: "面板大小", consensus: "共识 %", convergence: "收敛 %",
    back: "返回",
  },
  bookList: {
    title: "书籍", newBook: "新书", noBooks: "还没有书籍",
    noBooksDesc: "创建您的第一本书，开始写作之旅",
    createBook: "创建书籍", words: "字", chapters: "章",
    series: "系列：", updated: "更新于", book: "本书", books: "本书",
  },
  reports: {
    title: "报告", subtitle: "分析、连续性、市场分析和编辑概览",
    analytics: "分析", continuity: "连续性", market: "市场", edits: "编辑", documents: "文档",
  },
  stylePage: {
    title: "写作风格", subtitle: "您独特的声音指纹和风格分析",
    refreshStyle: "刷新风格", evolveStyle: "进化风格",
    noProfile: "还没有风格档案",
    noProfileDesc: "分析您的写作，捕捉指导代笔人的独特声音指纹。",
    captureStyle: "分析我的写作风格", agentRunning: "代理运行中...",
  },
  seriesPage: {
    title: "系列", newSeries: "新系列", noSeries: "还没有系列",
    noSeriesDesc: "将相关书籍分组到一个系列中",
    createSeries: "创建系列", books: "本书", docs: "文档",
  },
  chapterNew: {
    title: "新章节", subtitle: "为您的书添加新章节",
    chapterNumber: "章节编号", actNumber: "幕编号",
    titleOptional: "标题（可选）", titlePlaceholder: "章节标题...",
    cancel: "取消", creating: "创建中...", create: "创建章节", created: "章节已创建",
  },
  chaptersIndex: {
    title: "章节", subtitle: "浏览并打开书中的任意章节。", newChapter: "新章节",
    untitled: "无标题", words: "字",
    empty: "还没有章节", emptyDesc: "创建第一个章节，开始写作。", loadError: "无法加载章节，请重试。",
  },
  chapterStatuses: {
    undiscussed: "全新开始",
    discussed: "已讨论",
    planned: "已大纲",
    drafted: "初稿",
    dev_edited: "深度编辑",
    line_edited: "已精炼",
    beta_read: "读者测试",
    beta_passed: "已润色",
  },
  wordTarget: {
    setTarget: "设置字数目标",
    popoverTitle: "本章字数目标",
    placeholder: "例如 2000",
    clear: "清除",
    words: "字",
  },
  commandPalette: {
    placeholder: "搜索命令、章节、工作流...",
    chapters: "章节",
    workflows: "工作流",
    pages: "页面",
    recent: "最近",
    noResults: "未找到结果",
    actions: "操作",
  },
  wiki: {
    title: "世界百科",
    search: "搜索实体...",
    newEntry: "新条目",
    all: "全部",
    characters: "角色",
    locations: "地点",
    items: "物品",
    events: "事件",
    lore: "传说",
    noEntries: "还没有百科条目",
    noEntriesDesc: "手动创建条目，或让代理从故事圣经中自动填充。",
    editEntry: "编辑",
    deleteEntry: "删除",
    aliases: "别名",
    description: "描述",
    attributes: "属性",
    source: "来源",
    populate: "从文档中填充",
    populateDesc: "从故事圣经和章节中提取角色、地点和传说。",
    populating: "正在提取实体...",
    populated: "个实体已创建",
    noDocs: "请先创建故事圣经。",
  },
  writingDashboard: {
    title: "写作仪表板",
    todayWords: "今日字数",
    streak: "连续天数",
    weeklyAvg: "周均字数",
    totalWords: "总字数",
    dailyGoal: "每日目标",
    weeklyGoal: "每周目标",
    totalGoal: "总目标",
    setGoal: "设置目标",
    last30Days: "最近30天",
    days: "天",
    noData: "还没有写作数据。开始写作查看您的进度！",
  },
  journey: {
    chooseJourney: "选择您的旅程",
    chooseJourneyDesc: "选择一条创作路径来指导您的写作过程。",
    changeJourney: "更改旅程",
    switchConfirmTitle: "切换旅程？",
    switchConfirmDesc: "切换旅程将更新您的清单。您的作品不受影响。",
    switchConfirmAction: "切换",
    cancel: "取消",
    recommended: "推荐",
    steps: "步骤",
    stepOf: "/",
    allComplete: "旅程完成！",
    allCompleteDesc: "您已完成此旅程的所有步骤。恭喜！",
    celebrationBanner: "您的稿件旅程已完成！",
    noBannerYet: "未选择旅程",
    noBannerYetDesc: "选择一个旅程以查看您的进度清单。",
    nextStep: "下一步",
    startButton: "开始",
  },
};

const UI_STRINGS: Record<string, UIStrings> = {
  en: EN,
  sr: SR,
  de: DE,
  es: ES,
  fr: FR,
  ru: RU,
  zh: ZH,
};

/**
 * Get translated UI strings for a language code.
 * Falls back to English for unsupported languages.
 */
export function getUIStrings(language: string): UIStrings {
  return (
    UI_STRINGS[language] ??
    UI_STRINGS[language.split("-")[0]] ??
    EN
  );
}

/**
 * BCP-47 locale tags for each supported UI language code.
 * Used for number/date formatting (toLocaleString, Intl.*) so output does
 * NOT leak the server/system locale (e.g. Serbian day names or "500.000").
 */
const LOCALE_TAGS: Record<string, string> = {
  en: "en-US",
  sr: "sr-RS",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  ru: "ru-RU",
  zh: "zh-CN",
};

/**
 * Map a UI language code to a BCP-47 locale tag for number/date formatting.
 * Falls back to "en-US" for unsupported codes. Also handles tags with a
 * region suffix (e.g. "en-GB" -> "en" -> "en-US").
 */
export function localeFor(language: string): string {
  return (
    LOCALE_TAGS[language] ??
    LOCALE_TAGS[language.split("-")[0]] ??
    "en-US"
  );
}

/**
 * Get a writer-friendly label for a chapter status code.
 * Single source of truth — all components should use this.
 */
export function getStatusLabel(status: string, language: string): string {
  const t = getUIStrings(language);
  return (t.chapterStatuses as Record<string, string>)[status] ?? status;
}
