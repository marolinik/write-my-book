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
    /** H-3 / Lo-2: the billing page, named in English in the palette and the header. */
    billing: string;
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
    marketing: string;
    sectionTools: string;
    nextStep: string;
    library: string;
    transfer: string;
    development: string;
    // Mobile bottom nav (D-11)
    home: string;
    agent: string;
  };

  // Header
  header: {
    toggleSidebar: string;
    toggleAgent: string;
    openAgent: string;
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
    // UDG round-5 (Nikola): dismiss-for-now on the Recommended nudge.
    nudgeDismissed: string;
    undoDismiss: string;
  };

  // Settings
  settings: {
    customProviders: string;
    modelSelectionHint: string;
    perRoleOverridesHint: string;
    noCustomProvider: string;
    addProvider: string;
    noProvidersConnected: string;
    title: string;
    subtitle: string;
    apiKeys: string;
    apiKeysDescription: string;
    localFleet: string;
    roleGhostwriterDesc: string;
    roleEditorDesc: string;
    roleBetaReaderDesc: string;
    roleAnalystDesc: string;
    roleCoachDesc: string;
    roleCreativeDesc: string;
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
    getKey: string;
    validateAndSave: string;
    replace: string;
    remove: string;
    labelPlaceholder: string;
    usageSummary: string;
    noUsageYet: string;
    sessionsUnit: string;
    providerBlurbs: {
      anthropic: string;
      openrouter: string;
      openai: string;
      gemini: string;
      grok: string;
    };
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
    nameRequired: string;
  };

  // Common
  common: {
    cancel: string;
    accept: string;
    reject: string;
    restore: string;
    send: string;
    tryAgain: string;
    regenerate: string;
    upgrade: string;
    loading: string;
    error: string;
    save: string;
    delete: string;
    edit: string;
    close: string;
    confirm: string;
    add: string;
    yes: string;
    no: string;
    sessionOne: string;
    sessionFew: string;
    sessionMany: string;
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
    importInfo: string; manuscriptImported: string;
    /** Countable chapter noun — singular/plural pair, picked via pluralNoun(). */
    chapterOne: string; chapterMany: string;
    chapterFew: string;
    styleSampleLabel: string;
    styleSampleHint: string;
    styleSamplePlaceholder: string;
    analyzeImportedForStyle: string;
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
    /** Suffix after "3/5" in the progress line. */
    stepsDone: string;
    /** Banner offering the conversational setup instead of the wizard. */
    chatTitle: string; chatDesc: string; chatCta: string;
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

  // Book Development hub (pre-draft pipeline)
  bookDevelopment: {
    title: string; subtitle: string;
    idea: string; ideaDesc: string;
    synopsis: string; synopsisDesc: string;
    structure: string; structureDesc: string;
    research: string; researchDesc: string;
    plan: string; planDesc: string;
    draft: string; draftDesc: string;
    done: string; inProgress: string; notStarted: string;
    runWorkflow: string; viewArtifact: string; startWriting: string;
    concept: string; synopsisDoc: string; architecture: string; researchDoc: string; chapterPlan: string; manuscript: string;
    nextStep: string;
    researchHint: string;
    // UDG-5 (Miloš): series continuity reachability from the hub.
    continuity: string; continuityDesc: string; continuityLink: string;
    // UDG round-3 (Filip/Olivera): series "next book to start + per-volume state".
    nextBookTitle: string; nextBookDesc: string; nextStart: string; volumeStatus: string;
    // UDG round-5 (Ana/Bojan/Katarina): guided "start here" banner, keep-going
    // next-chapter block, and one-click story beats from the synopsis.
    startHere: string; startHereDesc: string;
    keepGoing: string; currentChapter: string;
    // O11 - the existing-manuscript path, for a book that arrived finished.
    importedTitle: string; importedSubtitle: string;
    impRead: string; impReadDesc: string;
    impStyle: string; impStyleDesc: string;
    impBible: string; impBibleDesc: string;
    impArchitecture: string; impArchitectureDesc: string;
    impAnalyze: string; impAnalyzeDesc: string;
    impRestructure: string; impRestructureDesc: string;
    impEdit: string; impEditDesc: string;
    impPathNote: string; impSwitchToGreenfield: string; impSwitchToImported: string;
    generateBeats: string; generateBeatsHint: string;
  };

  // Book settings
  bookSettings: {
    modelPerRoleHint: string;
    effectiveModelHint: string;
    dangerZone: string;
    dangerZoneHint: string;
    deleteBookHint: string;
    deleteBook: string;
    deleteConfirmIntro: string;
    deleteConfirmRest: string;
    typeLabel: string;
    thisBook: string;
    deletePermanently: string;
    toConfirm: string;
    deleting: string;
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
    synopsisForLineEdit: string; synopsisForLineEditDesc: string;
    // UDG round-4 (Elena): per-line-editor profile template.
    lineEditorProfile: string; lineEditorProfileDesc: string;
    profileStandard: string; profileDevelopmental: string; profileGoPub: string; profileSpare: string;
    // UDG round-5 (Igor): book-cover upload.
    coverTitle: string; coverTitleDesc: string; coverPreview: string;
    coverUpload: string; coverUploading: string; coverRemove: string; coverHint: string;
    coverSaved: string; coverRemoved: string; coverError: string; coverTypeError: string; coverTooLarge: string;
    coverDimensionsError: string;
    // UDG round-8 (Igor): inline cover crop/position editor.
    coverRecrop: string; coverCropTitle: string; coverCropHint: string; coverCropZoom: string;
    coverCropPosition: string; coverCropPositionH: string; coverCropPositionV: string;
    coverCropApply: string; coverCropCancel: string;
    betaPanel: string; betaPanelDesc: string;
    sourceBookRole: string;
    sourceBookDefault: string;
    sourceGlobalRole: string;
    sourceGlobalDefault: string;
    panelSize: string; consensus: string; convergence: string;
    back: string;
    // UDG round-6 (Sofija): reassurance that model/preference presets store only
    // configuration, never the writer's manuscript/document content.
    configOnlyNote: string;
    // UDG round-8 (Igor/Olivera): back cover upload + settings card.
    backCoverTitle: string; backCoverTitleDesc: string; backCoverLabel: string;
    backCoverUpload: string; backCoverRemove: string; backCoverHint: string;
    backCoverSaved: string; backCoverRemoved: string;
  };

  // Book list
  bookList: {
    title: string; newBook: string; noBooks: string; noBooksDesc: string;
    createBook: string; words: string; chapters: string;
    series: string; updated: string; book: string; books: string;
    /** The 2-4 form, for languages that count in three (S3-24). */
    bookFew: string;
    // S3-25: the shelf card subtitle, which was assembled in English.
    subWords: string; subDrafted: string; subNotStarted: string;
    subCreated: string; subLastTouched: string; subToday: string;
    subYesterday: string; subDaysAgo: string;
    subNoteOne: string; subNoteMany: string; subNotesPending: string;
    subDevEdited: string; subFinished: string; subArchived: string;
  };

  // Reports
  reports: {
    title: string; subtitle: string;
    analytics: string; continuity: string; market: string; edits: string; documents: string;
  };

  // Style page
  // O1 (editor sweep) - the writing surface itself.
  editorUI: {
    bold: string; italic: string; underline: string;
    h1: string; h2: string; h3: string;
    bulletList: string; orderedList: string; blockquote: string; sceneBreak: string;
    undo: string; redo: string; focusMode: string; findReplace: string;
    aiRewrite: string; quickChat: string; toggleAnnotations: string;
    findingsPanel: string; seriesContext: string; versionHistory: string;
    groupFormatting: string;
    groupHeadings: string;
    groupLists: string;
    groupHistory: string;
    groupTools: string;
    groupPanels: string;
    disableGhostText: string;
    enableGhostText: string;
    chapterOnly: string;
    splitView: string;
    editorToolbar: string; moreTools: string;
    saving: string; unsaved: string; saved: string; syncPending: string;
    annotationLegend: string; annotationSummary: string;
    find: string; findPlaceholder: string; replaceWith: string;
    replacePlaceholder: string; searchScope: string; searchFailed: string;
    aiEdit: string; describeChange: string; previousSuggestion: string; nextSuggestion: string;
    backToBook: string; previousChapter: string; nextChapter: string;
    closeTimer: string; resumeTimer: string; pauseTimer: string; stopTimer: string;
    noVersionsYet: string; loadingVersions: string; viewVersion: string;
    compareLatest: string; restoreVersion: string; loading: string;
    pause: string; readAloud: string; stop: string; nextSentence: string;
    readAloudSettings: string; voice: string; selectVoice: string; readingSpeed: string;
    refreshSeriesContext: string; closeSeriesContext: string; seriesContextError: string;
    seriesGraphUnavailable: string; seriesContextHint: string; noPriorCharacters: string;
    noOpenThreads: string; advisoryNote: string;
    dismiss: string; acceptSuggestion: string; generatingSuggestion: string;
    ambientSounds: string; volume: string; soundscapeVolume: string;
    focusLevel: string; immersive: string; immersiveHint: string; focusModeOptions: string;
    findings: string; closeFindings: string; filterFindings: string;
    agentQuickChat: string; askAboutText: string; askAgentHint: string;
    human: string; aiEdited: string; immersiveFocusMode: string; distractionFree: string;
    reviewSuggestion: string; overlappingFindings: string; closePacing: string;
    headingLevel: string;
    closeProseHighlights: string; describeChangeExample: string; selectChapter: string;
  };

  // O1 - the export configuration dialog.
  exportConfig: {
    title: string;
    tabMetadata: string;
    tabFront: string;
    tabBack: string;
    tabStyle: string;
    bookTitle: string;
    subtitle: string;
    author: string;
    seriesName: string;
    publisher: string;
    copyrightYear: string;
    sceneBreakGlyph: string;
    trimSize: string;
    coverPage: string;
    halfTitlePage: string;
    titlePage: string;
    copyrightPage: string;
    dedication: string;
    tableOfContents: string;
    coverImagePath: string;
    dedicationPath: string;
    aboutAuthor: string;
    aboutAuthorPath: string;
    alsoBy: string;
    alsoByPath: string;
    acknowledgments: string;
    acknowledgmentsPath: string;
    oxfordComma: string;
    spellOutNumbers: string;
    closedEmDashes: string;
    thinSpaceEllipsis: string;
    autoHyphenation: string;
    justifiedText: string;
  };

  // O1 - the batch editorial dialog.
  batchEditorial: {
    title: string;
    passes: string;
    chapters: string;
    firstChapter: string;
    lastChapter: string;
    budgetCap: string;
    capRange: string;
    run: string;
    status: string;
  };

  // O1 - the style profile and character lenses.
  styleUI: {
    twoLayerVoiceModel: string;
    lensSensory: string;
    lensMetaphor: string;
    lensInterior: string;
    lensRegister: string;
    lensBlindSpots: string;
    addLens: string;
    editLens: string;
    newLens: string;
    updateLens: string;
    createLens: string;
    noLenses: string;
    passagesHint: string;
    fullProseFingerprint: string;
    noStyleProfiles: string;
    noStructuredMetrics: string;
    sentenceLength: string;
    mean: string;
    median: string;
    stdDev: string;
    distribution: string;
    vocabularyRichness: string;
    typeTokenRatio: string;
    hapaxRate: string;
    register: string;
    dialogueRatio: string;
    ofTextIsDialogue: string;
    paragraphLength: string;
    singleSentence: string;
    punctuationPatterns: string;
    emDash: string;
    semicolon: string;
    ellipsis: string;
    narrativeDistance: string;
    closenessToCharacter: string;
    pointOfView: string;
    metaphorDomains: string;
    calibrationSamples: string;
    characterLenses: string;
    characterName: string;
    characterNameExample: string;
    sensoryPriority: string;
    sensoryPriorityExample: string;
    metaphorDomain: string;
    metaphorDomainExample: string;
    interiorStyle: string;
    interiorStyleExample: string;
    vocabularyRegister: string;
    vocabularyRegisterExample: string;
    blindSpots: string;
    blindSpotsHint: string;
  };

  // O1 - the analytics and edits report tabs.
  reportsUI: {
    scoreRangeHint: string;
    tensionOverlayHint: string;
    noPacingData: string;
    noDialogueData: string;
    overuseHint: string;
    noOveruse: string;
    costHint: string;
    keySplitHint: string;
    allYourKeys: string;
    allYourKeysHint: string;
    yourKeys: string;
    platformKeys: string;
    noDocumentsYet: string;
    noFindingsYet: string;
    noAnalysisReport: string;
    betaScores: string;
    readability: string;
    pacing: string;
    dialogue: string;
    overuse: string;
    cost: string;
    perChapterBeta: string;
    genreRange: string;
    inRange: string;
    outsideRange: string;
    clickBarHint: string;
    scoreTrendHint: string;
    linesCount: string;
    avgWords: string;
    foundTimes: string;
    overuseRatio: string;
    acrossSessions: string;
    noMarkupHint: string;
    scoreDistribution: string;
    betaProgression: string;
    fleschKincaid: string;
    fleschKincaidHint: string;
    gunningFog: string;
    gunningFogHint: string;
    colemanLiau: string;
    colemanLiauHint: string;
    tensionCurve: string;
    dialogueDistribution: string;
    dialogueDistributionHint: string;
    overuseDetection: string;
    totalCost30: string;
    costByKeySource: string;
    totalFindings: string;
    pending: string;
    applied: string;
    dismissed: string;
    criticalMajor: string;
    recentFindings: string;
    recentFindingsHint: string;
  };

  // O1 - book extras: the year recap, marketing kit, wiki, certificate, stats.
  bookUI: {
    bookTarget: string;
    completionForecast: string;
    forecastNeedsData: string;
    buildingPlan: string;
    rewardUnlocked: string;
    rewardUnlockedNamed: string;
    rewardUnlockAt: string;
    keepWriting: string;
    viewList: string;
    viewCanvas: string;
    viewPipeline: string;
    viewCorkboard: string;
    lifeKeepGoing: string;
    lifeNovella: string;
    lifeAlmostNovel: string;
    lifeNovels: string;
    mileFirstDraft: string;
    mileEditing: string;
    mileBetaPassed: string;
    mileProgress: string;
    shareStats: string;
    wrappedShare: string;
    wrappedShareStats: string;
    certShare: string;
    healthDrafting: string;
    healthEditorial: string;
    healthBeta: string;
    healthFindings: string;
    healthFoundation: string;
    healthEditedDetail: string;
    healthBetaDetail: string;
    foundStyle: string;
    foundBible: string;
    foundArchitecture: string;
    notifStreakRisk: string;
    notifStreakDetail: string;
    notifFindings: string;
    notifFindingsDetail: string;
    notifStale: string;
    notifStatus: string;
    timeMorning: string;
    timeAfternoon: string;
    timeEvening: string;
    timeNight: string;
    rewardMidnight: string;
    rewardMidnightDesc: string;
    rewardForest: string;
    rewardForestDesc: string;
    rewardSunrise: string;
    rewardSunriseDesc: string;
    rewardGalaxy: string;
    rewardGalaxyDesc: string;
    rewardThunder: string;
    rewardThunderDesc: string;
    rewardSpace: string;
    rewardSpaceDesc: string;
    rewardGaramondDesc: string;
    rewardLiterataDesc: string;
    rewardNovelist: string;
    rewardNovelistDesc: string;
    rewardIronWriter: string;
    rewardIronWriterDesc: string;
    achFirstWords: string;
    achFirstWordsDesc: string;
    achGettingStarted: string;
    achGettingStartedDesc: string;
    achSerious: string;
    achSeriousDesc: string;
    achNaNo: string;
    achNaNoDesc: string;
    achProlific: string;
    achProlificDesc: string;
    achOnRoll: string;
    achOnRollDesc: string;
    achWeek: string;
    achWeekDesc: string;
    achMonthly: string;
    achMonthlyDesc: string;
    achChapterOne: string;
    achChapterOneDesc: string;
    achFirstDraft: string;
    achFirstDraftDesc: string;
    achReaderApproved: string;
    achReaderApprovedDesc: string;
    achSprint: string;
    achSprintDesc: string;
    achEditorialEye: string;
    achEditorialEyeDesc: string;
    noTasksToday: string;
    certificateOfCompletion: string;
    share: string;
    complete: string;
    writingJourney: string;
    storeDescriptionHtml: string;
    rewards: string;
    dropHere: string;
    headsUp: string;
    createdWith: string;
    shareProgress: string;
    storyHealth: string;
    storyRadar: string;
    retry: string;
    noAttributesYet: string;
    achievements: string;
    writingActivity: string;
    shareYourWrapped: string;
    archive: string;
    archiveHint: string;
    yourYear: string;
    inWriting: string;
    youWrote: string;
    wordsThisYear: string;
    longestStreak: string;
    daysInARow: string;
    youAreA: string;
    peakMonthWas: string;
    writerPersonality: string;
    aiSessions: string;
    editsReviewed: string;
    generateKit: string;
    // S3-12: the editor's selection menu — the writer's most-used surface.
    // S3-16: the batch editorial dialog.
    // S3-17: the series tabs and the two new series-level views.
    seriesTabOverview: string; seriesTabDocuments: string;
    seriesTabInheritance: string; seriesTabSynthesis: string;
    seriesTabAnalytics: string; seriesTabContinuity: string;
    seriesTabStructure: string; seriesTabMarket: string;
    seriesStructureWhat: string; seriesMarketWhat: string;
    seriesChapters: string; seriesMedian: string;
    seriesOpenStructure: string; seriesOpenMarket: string;
    seriesNoMarket: string; seriesRunMarket: string;
    batchWhat: string; batchTo: string; batchRange: string; batchCapNote: string;
    batchNow: string; batchTonight: string; batchQueue: string;
    batchQueued: string; batchScheduled: string; batchFailed: string;
    batchStatusNote: string; batchCancel: string; batchNew: string;
    seriesDocPending: string;
    batchEditorial: string;
    allChaptersHint: string;
    typeMessage: string;
    runsInBackground: string;
    ctxExpand: string; ctxTighten: string; ctxPov: string;
    ctxSensory: string; ctxTension: string; ctxShow: string;
    ctxDescribe: string; ctxAskCoach: string; ctxAskCoachAbout: string;
    marketingKitTitle: string;
    marketingKitWhat: string;
    blurb: string;
    store: string;
    social: string;
    email: string;
    comps: string;
    logline: string;
    backCoverBlurb: string;
    launchEmail: string;
    comparisonTitles: string;
    name: string;
    entityNamePlaceholder: string;
    type: string;
    addAlias: string;
    describeEntity: string;
    key: string;
    value: string;
    certifiesThat: string;
    betaScoreTooltip: string;
    wordsCount: string;
    daysFromNow: string;
    wordsPerDayAvg: string;
    wordsRemaining: string;
    todaysPlan: string;
    planSummary: string;
    completedOn: string;
    memberForDays: string;
    generatedOn: string;
    postNumber: string;
    byAuthor: string;
    percentHealthy: string;
    criticalCount: string;
    warningsCount: string;
    checkingPacing: string;
    alsoKnownAs: string;
    streakDays: string;
    bestStreakBadge: string;
    wordsTotal: string;
    activeDaysCount: string;
    avgPerDay: string;
    yearInWriting: string;
    thatsPages: string;
    novelFull: string;
    novelAlmost: string;
    novellaStrong: string;
    everyWordCounts: string;
    showedUpDays: string;
    writingHappensAround: string;
    wordsOfTarget: string;
    noTargetSet: string;
    completedFirstDraft: string;
    words: string;
    chapters: string;
    days: string;
    totalWords: string;
    books: string;
    bestStreak: string;
    daysWriting: string;
    wordsWritten: string;
    dayStreak: string;
    progress: string;
  };

  // O1 - series, agent panel, memory and provider settings.
  workspaceUI: {
    seriesTitleRequired: string;
    seriesTitleExample: string;
    genre: string;
    genreExample: string;
    seriesType: string;
    plannedBooks: string;
    description: string;
    descriptionExample: string;
    sessionHistory: string;
    stopAgent: string;
    dockToSidebar: string;
    floatAsOverlay: string;
    noPastSessions: string;
    review: string;
    writingAgent: string;
    /** Running-session stats bar. Both carry {n}. */
    stepN: string;
    turnN: string;
    selectBook: string;
    refreshList: string;
    providerName: string;
    providerNameExample: string;
    baseUrl: string;
    keyOptional: string;
    keyPlaceholder: string;
    memorySystem: string;
    qdrantConnection: string;
    totalChunks: string;
    totalSearches: string;
    lastIndexed: string;
    embeddingCost: string;
    rebuildIndex: string;
    clearMemory: string;
    notIndexed: string;
    memoryExample: string;
    edit: string;
    forgetThis: string;
    noMemories: string;
    noMemoriesHint: string;
    inheritInto: string;
    selectBookEllipsis: string;
    loading: string;
    document: string;
    status: string;
    action: string;
    loadingAnalytics: string;
    books: string;
    totalWords: string;
    chapters: string;
    documents: string;
    perBookProgress: string;
    artifactType: string;
    loadingContributions: string;
    book: string;
    booksInSeries: string;
    bookTitlePlaceholder: string;
    removeFromSeries: string;
  };

  // O1 - the remaining app surfaces.
  appUI: {
    tierProfessional: string;
    showAllChapters: string;
    tierPublisher: string;
    tierFounder: string;
    themeLight: string;
    themeDark: string;
    themeSystem: string;
    upgradeRequired: string;
    viewPlans: string;
    bookName: string;
    styleFingerprint: string;
    storyBible: string;
    architecture: string;
    currentlyWriting: string;
    waitingForFeedback: string;
    completed: string;
    archived: string;
    target: string;
    upload: string;
    previewEdit: string;
    done: string;
    previewEditChapters: string;
    modelSelection: string;
    globalDefaultModel: string;
    globalDefaultModelHint: string;
    perRoleOverrides: string;
    myNovel: string;
    noSeries: string;
    expandToFullPanel: string;
    minimize: string;
    helpfulSuggestion: string;
    notHelpful: string;
    wasThisHelpful: string;
    searchDocuments: string;
    allTypes: string;
    allClear: string;
    radarFailed: string;
    noPacingIssues: string;
    closeConversation: string;
    explainIntent: string;
    dragToReorder: string;
    clickToRename: string;
    bringYourOwnKeys: string;
    yourWritingStaysYours: string;
    fullCostControl: string;
    bookActions: string;
    archiveThisBook: string;
    documentMetadata: string;
    documentInfo: string;
    journeys: string;
    allWorkflows: string;
    less: string;
    more: string;
    wordsWritten: string;
    sprintComplete: string;
    allChapters: string;
    dismiss: string;
    searchCommands: string;
    noResults: string;
    selectModel: string;
    useDefault: string;
    onboardingComplete: string;
    chooseCharacter: string;
    describeChange: string;
    dismissSession: string;
    untitled: string;
    atCurrentPace: string;
    wordCountTarget: string;
    clickToEditTitle: string;
    dayStreak: string;
    marketAnalysis: string;
    marketReport: string;
    documents: string;
    documentsHint: string;
    toggleTheme: string; keyboardShortcuts: string; analysisProgress: string;
    noEditHistory: string; qualityScore: string; open: string;
    continueToChapter: string; reviewFeedback: string;
    noAchievements: string; wrappedHint: string;
  };

  // O1 - main-surface strings that used to be written inline in English.
  // S3-2 - the document library's groups, ordered as the boards order the work.
  docLibrary: {
    foundation: string; structure: string; research: string; chapters: string;
    // S3-3: the library page chrome, the last of it.
    worldBible: string; chatCharacters: string;
    docCount: string; docOne: string; docMany: string; docFew: string;
    organisedBy: string; newDocument: string; noMatch: string; noneYet: string;
    chapterN: string; justNow: string; minutesAgo: string; hoursAgo: string; daysAgo: string;
    never: string;
    analysis: string; editorial: string; publishing: string; notes: string;
    /** Carries a {group} placeholder. */
    emptyGroup: string;
    /** Carries a {workflow} placeholder. */
    startWorkflow: string;
  };

  screens: {
    bookProgress: string; drafted: string; edited: string; betaPassed: string;
    wordCount: string; recentSessions: string; editorialFindings: string;
    modelOverrides: string; bookDefaultModel: string; bookDefaultModelDesc: string;
    perRoleOverrides: string; resolutionPreview: string; deleteBook: string;
    totalBooks: string; totalChapters: string; totalWords: string; seriesDocuments: string;
    somethingWentWrong: string; pageNotFound: string; generateReports: string;
    current: string; enterprise: string; contactUs: string; byok: string;
    totalSpent30: string; tokenUsage30: string; totalSessions: string;
    inputTokens: string; outputTokens: string; estCost: string;
    usageByAgent: string; usageByModel: string; usageByBook: string; last30Days: string;
  };

  // O3 - documents damaged before the encoding and language fixes.
  documentDamage: {
    title: string; body: string; regenerate: string; unrecoverable: string;
    reasonReplacement: string; reasonDoubleEncoded: string;
    reasonWrongLanguage: string; reasonEmpty: string; reasonStitched: string;
  };

  // O10 - the continuity tab: one book or a whole series, and no hardcoded English.
  continuityTab: {
    title: string; subtitle: string;
    run: string; runSeries: string;
    tracker: string; trackerEmpty: string; findingsSummary: string;
    report: string; reportDesc: string; reportEmpty: string;
    findings: string; domainFindings: string; showAll: string; chapterShort: string;
    domCharacters: string; domTimeline: string; domGeography: string;
    domObjects: string; domRelationships: string; domWorld: string; domOther: string;
  };

  // O12 - structural revision pass
  structure: {
    tab: string; title: string; subtitle: string;
    runPass: string; running: string; refresh: string;
    empty: string; emptyDesc: string; loadError: string;
    pending: string; accepted: string; rejected: string; applied: string;
    failed: string; undone: string;
    accept: string; reject: string; undo: string; rejectNote: string;
    reason: string; evidence: string; confidence: string;
    kindReorder: string; kindRenumber: string; kindMerge: string; kindSplit: string;
    moveReorder: string; moveMerge: string; moveSplit: string;
    nothingChangesYet: string; applyError: string; undoError: string;
    fromAnalysis: string;
    // S3-4: the board used to say "in progress" while the agent had long
    // finished and the proposals were waiting on the writer.
    /** Carries a {n} placeholder for the rendered count. */
    awaitingDecision: string;
    decidePending: string;
    // D-204: the engine records its result in English. These are what the
    // writer reads, derived from the move itself.
    doneReorder: string; doneMerge: string; doneSplit: string;
    proposalOne: string; proposalMany: string;
    /** Fold holding decided, undone and failed moves. Carries {n}. */
    history: string;
    // S3-8: the engine's reasons reached the panel as raw English. Codes are
    // the contract between engine and UI; the prose belongs here.
    errNotPending: string;
    errChapterGone: string;
    errAnchorMissing: string;
    errAnchorAmbiguous: string;
    errAnchorTooEarly: string;
    errNotAdjacent: string;
    errBookChanged: string;
  };

  // S3-10: the reports tabs. Each one states what the pass measured and, once
  // it has run, what the writer can do with the answer.
  reportTabs: {
    marketSubtitle: string;
    marketRun: string;
    marketBy: string;
    marketEmpty: string;
    continuitySubtitle: string;
    continuityBy: string;
    reportLost: string;
    nextStep: string;
    marketNext: string; marketNextDo: string;
    structureNext: string; structureNextDo: string;
    /** Style page. styleCaptured carries {date}. */
    styleCaptured: string;
    unitWords: string; unitSentences: string;
    styleProfileName: string;
    styleProfileAuto: string;
  };

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
    seriesOne: string;
    seriesFew: string;
    seriesMany: string;
    // UDG round-9 (Olivera/Igor): series cover + omnibus export + printable report.
    omnibusTitle: string; omnibusDesc: string; coverLabel: string; coverUpload: string;
    coverRemove: string; coverHint: string; coverSaved: string; coverRemoved: string;
    exportOmnibus: string; exporting: string; exportDone: string; exportError: string;
    noBooksForExport: string; printableReport: string;
  };

  // UDG round-6 (Darko/Luka): printable/shareable read-only snapshots.
  snapshot: {
    title: string; subtitle: string; exportedOn: string; print: string;
    bookProgress: string; words: string; chapters: string; chaptersDrafted: string;
    betaAvg: string; editedPlus: string; status: string;
    draftedV: string; passBeta: string; colon: string; wordsOfTarget: string;
    currentStreak: string; bestStreak: string; activeDays: string;
    pendingFindingsLabel: string; appliedFindingsLabel: string; healthScore: string; alerts: string;
    chapterStatus: string; name: string; betaScore: string;
    editorialBrief: string; allFindings: string; findingsList: string;
    noFindings: string; chapter: string; suggestion: string;
    link: string; editorialLink: string;
    // UDG round-7 (Luka 12): share-link button on snapshots (account-less).
    shareLink: string; sharedLink: string; shareFailed: string;
    // UDG round-7 (Darko/Tamara): analysis stats table in the printable snapshot.
    analytics: string; fleschKincaid: string; gunningFog: string; colemanLiau: string;
    genreRange: string; dialogueShare: string; dialogueLines: string; pacingTension: string;
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
    // H-3: the palette's own group heading for the book you are in. The other
    // headings existed here all along and the component printed English.
    currentBook: string;
  };

  // Wiki
  wiki: {
    title: string;
    search: string;
    newEntry: string;
    typeCharacter: string;
    typeLocation: string;
    typeItem: string;
    typeEvent: string;
    typeLore: string;
    typeCustom: string;
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

  // Export surface (UDG round-3, Jelena)
  export: {
    title: string; download: string; configure: string; outputFormat: string;
    exportAs: string; exporting: string; exportComplete: string; history: string;
    formatGuidance: { docx: string; pdf: string; epub: string };
    draftMode: string; draftModeHint: string;
    words: string; chapters: string; pages: string; lastExport: string;
  };

  // Editorial surface (UDG round-3, Jelena)
  editorial: {
    title: string; runDevEdit: string; runLineEdit: string; runBetaRead: string;
    stage: { drafted: string; devEdited: string; lineEdited: string; betaRead: string; passed: string };
    noChapters: string; noChaptersDesc: string; goToSetup: string;
    tabFindings: string; tabHistory: string; tabSummary: string; tabHandoff: string;
    handoff: {
      storySynopsis: string; noSynopsis: string; chapterFindings: string;
      filterLabel: string; statusPending: string; statusAll: string;
      copyTitle: string; copy: string; copied: string;
      noFindingsChapter: string; noFindingsSelectChapter: string;
      loadingFindings: string;
    };
    findings: {
      title: string; noMatch: string; resetFilters: string;
      empty: string; emptyDesc: string; chapterNotFound: string;
      apply: string; dismiss: string; undo: string; jumpToText: string;
      showDiff: string; hideDiff: string; showSuggestion: string; hideSuggestion: string;
      discuss: string; hide: string; autoApply: string; textChanged: string;
      applyErrorTextNotFound: string;
    };
    summary: {
      total: string; pending: string; applied: string; dismissed: string;
      severityBreakdown: string; chaptersWithPending: string;
    };
    filters: {
      severityPlaceholder: string; allSeverities: string;
      categoryPlaceholder: string; allCategories: string;
      statusPlaceholder: string; allStatuses: string;
      agentTypePlaceholder: string; allAgents: string; resetAll: string;
    };
  };

  // H-10 - every toast the writer is shown. These were English literals at
  // 43 call sites; a toast is the product's only voice for that worked and
  // that failed, so an English one silently un-localises the whole app.
  toasts: {
    documentChangedOutside: string;
    chapterChangedOutside: string;
    bookDeleted: string;
    bookDeleteFailed: string;
    setupComplete: string;
    seriesCreated: string;
    apiKeyRequired: string;
    startingNextWorkflow: string;
    responseFailed: string;
    chapterReorderFailed: string;
    chaptersReordered: string;
    chapterStatusFailed: string;
    certificateCopied: string;
    copyFailed: string;
    copiedToClipboard: string;
    marketingKitGenerated: string;
    marketingKitFailed: string;
    progressCopied: string;
    rewriteFailed: string;
    draftRecovered: string;
    discardRecovery: string;
    noMatchesReplaced: string;
    replaceFailed: string;
    autosaveFailing: string;
    selectTextFirst: string;
    selectTextForRewrite: string;
    anchorNotFound: string;
    findingNotAnchored: string;
    passageMoved: string;
    yourVersionSaved: string;
    yourVersionSaveFailed: string;
    backupFailed: string;
    wordTargetFailed: string;
    pickOnePass: string;
    batchCancelFailed: string;
    batchCancelled: string;
    memoryAdded: string;
    memoryAddFailed: string;
    memoryRemoved: string;
    memoryUpdated: string;
    onboardingReadyToWrite: string;
    onboardingComplete: string;
    seriesLanguageSaved: string;
    seriesLanguageFailed: string;
  };

  // H-10 - the agent panel's own chrome. Every string here was an English
  // literal in the surface the writer spends the most time watching.
  agentUI: {
    noContextTitle: string;
    talkToCharacter: string;
    yourCharacter: string;
    noContextHint: string;
    activeBook: string;
    seriesNeedsBook: string;
    continueWhereLeftOff: string;
    lastResponse: string;
    working: string;
    agentWorking: string;
    companionBlurb: string;
    quickActions: string;
    allWorkflows: string;
    completed: string;
    openFullPanel: string;
    insightWarning: string;
    insightSuggestion: string;
    insightFlag: string;
    insightConstraint: string;
    insightFrom: string;
    loadingInsights: string;
    insightsLoadFailed: string;
    noInsights: string;
    blackboard: string;
    insightsActive: string;
    characterChat: string;
    reset: string;
    sessionTimedOut: string;
    extendFifteen: string;
    showInText: string;
    switchProvider: string;
    approve: string;
    modify: string;
    reject: string;
    timedOut: string;
    agentSession: string;
    queuedForBackground: string;
    navigateAwayHint: string;
    ctaReviewFindings: string;
    ctaOpenChapter: string;
    ctaContinueSetup: string;
    ctaViewDocuments: string;
    ctaViewReports: string;
    apiKeyHint: string;
    workflowCompleted: string;
    backgroundDone: string;
    viewResults: string;
    viewInPanel: string;
    addedToQueue: string;
    quickFreewrite: string;
    quickAskCoach: string;
    endedEarlyBudget: string;
    endedEarlyTime: string;
    hideDetail: string;
    showDetail: string;
    speakerYou: string;
    requiresSonnet: string;
    requiresOpus: string;
    upgradeModel: string;
    approved: string;
    rejected: string;
    modified: string;
    previousTimedOut: string;
    clearQueue: string;
    startAll: string;
    queueCount: string;
    chooseJourney: string;
    addToQueue: string;
    stepOptional: string;
    perChapter: string;
    startThisStep: string;
    chapterAbbrev: string;
    minutesAbbrev: string;
    tokensAbbrev: string;
    findingOne: string;
    findingFew: string;
    findingMany: string;
    stepOne: string;
    stepFew: string;
    stepMany: string;
    findingsNeedReview: string;
    findingsCreatedCount: string;
    runningCount: string;
    activeCount: string;
    failedToLoadInsights: string;
    characterThinking: string;
    characterChatTips: string;
    elapsedRemaining: string;
    tokensInOut: string;
    inputTokensCount: string;
    outputTokensCount: string;
    currentScoreHint: string;
    estimatedCost: string;
    inclEmbeddings: string;
    completedInMinutes: string;
    ofMaxMinutes: string;
    sessionsComplete: string;
    stepProgress: string;
    feedbackYes: string;
    feedbackNo: string;
    feedbackThanks: string;
    feedbackNoted: string;
    canLoopBackTo: string;
  };

  // H-10 - editorial badges and the finding conversation's decision row.
  editorialUI: {
    actionApply: string;
    passesDone: string;
    passesSkipped: string;
    chapterRef: string;
    locationTo: string;
    keepAsIsMemory: string;
    actionDismiss: string;
    actionUndo: string;
    actionSessionComplete: string;
    useIt: string;
    keepAsIs: string;
    capReached: string;
    settleDisabledTitle: string;
    batchScheduledNote: string;
    passesFailed: string;
    haltedWithReason: string;
    statusQueued: string;
    statusRunning: string;
    statusNeedsApproval: string;
    statusHalted: string;
    statusDone: string;
    statusFailed: string;
    statusCancelled: string;
  };

  // H-10 - the editor's own chrome: status bar, find-and-replace, pacing and
  // syntax panels, the conflict dialog's two choices.
  editorChrome: {
    stillWriting: string;
    rewriteComparison: string;
    loadingSeriesContext: string;
    intentional: string;
    authorship: string;
    checking: string;
    resetFilters: string;
    conflictReview: string;
    offlineSavedLocally: string;
    offlineNotSaved: string;
    searchHelp: string;
    wholeWord: string;
    caseSensitive: string;
    wholeWordDisabled: string;
    searching: string;
    exitFocus: string;
    generate: string;
    inlineEditHint: string;
    loadingChapter: string;
    pacing: string;
    sentencePacing: string;
    pacingShort: string;
    pacingMedium: string;
    pacingLong: string;
    pacingVeryLong: string;
    findingAria: string;
    focusThemeAria: string;
    focusThemeDark: string;
    focusThemeSepia: string;
    focusThemePaper: string;
    pacingSectionAria: string;
    wordOne: string;
    wordFew: string;
    wordMany: string;
    soundRain: string;
    soundCoffee: string;
    soundLibrary: string;
    soundFireplace: string;
    soundForest: string;
    soundOcean: string;
    annInsertion: string;
    annDeletion: string;
    annComment: string;
    annAiSuggestion: string;
    annFinding: string;
    annHighSeverity: string;
    annMediumSeverity: string;
    annLowSeverity: string;
    annContinuity: string;
    legendAiSuggestionDesc: string;
    legendFindingDesc: string;
    legendAcceptedChange: string;
    legendAcceptedDesc: string;
    legendDeletionDesc: string;
    legendCommentDesc: string;
    replacedAcross: string;
    tryAgainHint: string;
    scopeThisChapter: string;
    scopeWholeBook: string;
    keyboardHint: string;
    focusNormalDesc: string;
    focusFocusedDesc: string;
    focusParagraphDesc: string;
    inlineRewrite: string;
    inlineImprove: string;
    inlineShorten: string;
    inlineExtend: string;
    inlineRevise: string;
    inlineMoreDialogue: string;
    inlineMoreVivid: string;
    inlineMoreFormal: string;
    chapterPlaceholder: string;
    conflictNewerVersion: string;
    offlineKept: string;
    conflictPreserved: string;
    conflictChangedAgain: string;
    conflictDiffUpdated: string;
    versionManual: string;
    versionRestore: string;
    versionImport: string;
    openSettings: string;
    hideDiff: string;
    showDiff: string;
    useEdited: string;
    acceptRewrite: string;
    noFindingsMatch: string;
    noFindingsChapter: string;
    adjustFilters: string;
    runWorkflowForFindings: string;
    previewHint: string;
    noMatches: string;
    matchOne: string;
    matchFew: string;
    matchMany: string;
    occurrenceOne: string;
    occurrenceFew: string;
    occurrenceMany: string;
    matchesInChapters: string;
    severityAnnounce: string;
    compareVersions: string;
    versionN: string;
    historyOf: string;
    insertOne: string;
    insertFew: string;
    insertMany: string;
    deleteOne: string;
    deleteFew: string;
    deleteMany: string;
    commentOne: string;
    commentFew: string;
    commentMany: string;
    wordsCount: string;
    originalWithWords: string;
    aiRewriteWithWords: string;
    charactersCount: string;
    matchedFrom: string;
    openThreadsCount: string;
    toneVsBook: string;
    pctVsSeries: string;
    letsTalkAboutThis: string;
    goToChapter: string;
    pctYours: string;
    humanWritten: string;
    aiGenerated: string;
    aiEdited: string;
    minRead: string;
    severityHighShort: string;
    severityMediumShort: string;
    severityLowShort: string;
    severityHighFindings: string;
    severityMediumFindings: string;
    severityLowFindings: string;
    savedAt: string;
    replaceAll: string;
    sessionWordsGained: string;
    wordsPerMinuteShort: string;
    wordsThisSession: string;
    wordsPerMinute: string;
    chapterOfTotal: string;
    avgWordsPerSentence: string;
    pctShort: string;
    pctLong: string;
    adverbsPct: string;
    adjectivesPct: string;
    moreWords: string;
    speedRate: string;
    changedOutsideEditor: string;
    saveConflictHint: string;
    restoreVersionTitle: string;
    restoreVersionHint: string;
    syntax: string;
    proseSyntaxAnalysis: string;
    verbs: string;
    adjectives: string;
    adverbs: string;
    loadTheirs: string;
    keepMine: string;
    timer: string;
    describeYourChange: string;
    multipleFindingsHere: string;
    selectChapterToView: string;
    distractionFreeHint: string;
    immersiveMode: string;
    continuityHere: string;
    continuityElsewhere: string;
    continuityFlags: string;
    focusNormal: string;
    focusFocused: string;
    focusParagraph: string;
  };

  // H-10 - the series surfaces: the book manager, the inheritance panel
  // and the synthesis panel. The series path is the least language-aware
  // part of the product and the one the owner's trilogy runs through.
  seriesUI: {
    artifactFingerprint: string;
    addBook: string;
    existingBook: string;
    newBook: string;
    noBooksAvailable: string;
    addToSeries: string;
    create: string;
    noBooksInSeries: string;
    bookNumberName: string;
    ownVersion: string;
    wordsCount: string;
    chaptersCount: string;
    documentsCount: string;
    noSeriesDocuments: string;
    selectBookForInheritance: string;
    noInheritableDocuments: string;
    seriesVersion: string;
    bookVersion: string;
    available: string;
    missing: string;
    inherit: string;
    applyAllAvailable: string;
    noAnalyticsData: string;
    synthesizeHint: string;
    noBooksInSeriesShort: string;
    hasArtifact: string;
    synthesize: string;
    noContributionYet: string;
  };

  // H-10 - the import wizard, the export history and the readiness check.
  importExportUI: {
    noExportsYet: string;
    preview: string;
    contents: string;
    dropFiles: string;
    chaptersDetected: string;
    mergeSelected: string;
    wordsCount: string;
    existingChaptersHint: string;
    supportedFiles: string;
    importChapters: string;
    importedSuccessfully: string;
    analysisStartingHint: string;
    passedCount: string;
    warningsCount: string;
    issuesCount: string;
    uploadManuscript: string;
    parsingFiles: string;
    supportedFormats: string;
    reorderHint: string;
    startOver: string;
    importing: string;
    importComplete: string;
    importAnother: string;
    manuscriptReadiness: string;
    runPublishingCheck: string;
    previewPageTitle: string;
    previewPageChapter: string;
    exportManuscript: string;
    exportAnyway: string;
    devicePrint: string;
    devicePhone: string;
    formatPlainText: string;
    mergedSuffix: string;
    readyChaptersDrafted: string;
    readyChaptersEdited: string;
    readyBetaReading: string;
    readyPendingFindings: string;
    readyFingerprint: string;
    readyStoryBible: string;
    readyDraftedDetail: string;
    readyEditedAll: string;
    readyEditedSome: string;
    readyBetaAll: string;
    readyBetaSome: string;
    readyFindingsNone: string;
    readyFindingsSome: string;
    readyFingerprintYes: string;
    readyFingerprintNo: string;
    readyBibleYes: string;
    readyBibleNo: string;
    formatDocxDesc: string;
    formatPdfDesc: string;
    formatEpubDesc: string;
    importDocxDesc: string;
    importMarkdownDesc: string;
    importTxtDesc: string;
  };

  // H-10 - the writer-memory panel and the vector-store status.
  memoryUI: {
    vectorMemoryHint: string;
    totalEmbeddingUsage: string;
    indexedAgo: string;
    countTotal: string;
    countAiLearned: string;
    connected: string;
    unreachable: string;
    qdrantUnreachable: string;
    statsUnavailable: string;
    memory: string;
    writerMemory: string;
    writerMemoryHint: string;
    chunkOne: string;
    chunkFew: string;
    chunkMany: string;
    catStyle: string;
    catName: string;
    catPreference: string;
    catConstraint: string;
    catCorrection: string;
    catLearned: string;
    clearConfirm: string;
  };

  // H-10 - the first five minutes a writer spends in the product.
  onboardingUI: {
    welcome: string;
    stepsComplete: string;
    privacyBlurb: string;
    providersConnected: string;
    tagline: string;
    noCardNeeded: string;
    byokExplainer: string;
    pricingExplainer: string;
    getStarted: string;
    addYourKeys: string;
    addKeysHint: string;
    starting: string;
    continueLabel: string;
    chooseDefaultProvider: string;
    defaultProviderHint: string;
    finishing: string;
    docsCreated: string;
    skipStartFree: string;
    finishSetup: string;
    stepReading: string;
    stepStyle: string;
    stepBible: string;
    stepStructure: string;
    costHintAnthropic: string;
    costHintOpenrouter: string;
    costHintOpenai: string;
    costHintGemini: string;
    costHintGrok: string;
  };

  // Lo-1 - the keyboard-shortcut help. The table in lib/keyboard-shortcuts.ts
  // held English descriptions; it now holds lookups into this section.
  shortcuts: {
    openCommandPalette: string;
    showShortcuts: string;
    toggleSidebar: string;
    aiRewriteSelect: string;
    nextFinding: string;
    previousFinding: string;
    closePopup: string;
    exitImmersive: string;
    sendMessage: string;
    newLine: string;
    contextGlobal: string;
    contextEditor: string;
    contextAgent: string;
    dialogHint: string;
  };

  // H-10 - route-level chrome: the error and not-found pages, the series
  // document views, and the buttons that move between them.
  pagesUI: {
    errorOccurred: string;
    goToDashboard: string;
    docType: string;
    docVersion: string;
    docModified: string;
    docCreated: string;
    docAgent: string;
    docWordsCount: string;
    bookNumberSuffix: string;
    ofTargetWords: string;
    notFoundHint: string;
    progressAcrossSeries: string;
    everythingCreatedIn: string;
    chaptersEdited: string;
    booksOfPlanned: string;
    modelOverridesHint: string;
    guidedSetupInstead: string;
    setTargetInSettings: string;
    findingsNeedReview: string;
    review: string;
    loadingDocument: string;
    library: string;
    startWriting: string;
    backToSetup: string;
    crossBookContinuity: string;
    backToSeries: string;
    seriesLevel: string;
    bookNamed: string;
    seriesWide: string;
    metaNotFound: string;
    metaSnapshot: string;
    metaEditorialBrief: string;
    setupFailed: string;
    setupSavedNoChapter: string;
    alertFindingsNeedReview: string;
    alertBetaFailed: string;
    seriesDuology: string;
    seriesTrilogy: string;
    seriesTetralogy: string;
    seriesPentalogy: string;
    seriesSaga: string;
    seriesOpenEnded: string;
    docPlaceholder: string;
    conflictSafeHint: string;
    bookLevel: string;
    noSeriesDocs: string;
    allDocuments: string;
  };

  // H-10 - the usage and billing page, including the sentence that explains
  // the writer pays providers directly.
  billingUI: {
    usageAndBilling: string;
    agentSessionOne: string;
    agentSessionFew: string;
    agentSessionMany: string;
    freeTrialOf: string;
    trialEnds: string;
    monthlyEquivalent: string;
    founderClaimed: string;
    founderLeft: string;
    enterpriseHint: string;
    ownKeysNoMarkup: string;
    keySplitBadge: string;
    costDriftHint: string;
    priceDiscrepancies: string;
    tokensEmbedded: string;
    tokensInOut: string;
    combinedAcrossSlots: string;
    totalTokensCount: string;
    requiresPlan: string;
    featureRequiresPlan: string;
    choosePlan: string;
    stripeNotConfigured: string;
    manageSubscription: string;
    monthly: string;
    annual: string;
    saveSeventeen: string;
    noCreditCard: string;
    soldOut: string;
    subscriptionExplainer: string;
    yourSpend: string;
    yourSpendHint: string;
    estimatesInaccurate: string;
    llmAgentCosts: string;
    embeddingCosts: string;
    noUsageData: string;
    embeddings: string;
    noDataYet: string;
    noPerBookUsage: string;
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
