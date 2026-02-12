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
    recentBooks: string;
    createBook: string;
    noBooksYet: string;
    noBooksDescription: string;
    words: string;
    chapters: string;
    updated: string;
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
    recentBooks: "Recent Books",
    createBook: "Create Book",
    noBooksYet: "No books yet",
    noBooksDescription: "Create your first book to get started",
    words: "words",
    chapters: "chapters",
    updated: "Updated",
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
    recentBooks: "Nedavne knjige",
    createBook: "Kreiraj knjigu",
    noBooksYet: "Još nema knjiga",
    noBooksDescription: "Kreirajte svoju prvu knjigu da biste počeli",
    words: "reči",
    chapters: "poglavlja",
    updated: "Ažurirano",
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
    recentBooks: "Aktuelle Bücher",
    createBook: "Buch erstellen",
    noBooksYet: "Noch keine Bücher",
    noBooksDescription: "Erstellen Sie Ihr erstes Buch, um loszulegen",
    words: "Wörter",
    chapters: "Kapitel",
    updated: "Aktualisiert",
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
    recentBooks: "Libros recientes",
    createBook: "Crear libro",
    noBooksYet: "Aún no hay libros",
    noBooksDescription: "Crea tu primer libro para empezar",
    words: "palabras",
    chapters: "capítulos",
    updated: "Actualizado",
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
    recentBooks: "Livres récents",
    createBook: "Créer un livre",
    noBooksYet: "Pas encore de livres",
    noBooksDescription: "Créez votre premier livre pour commencer",
    words: "mots",
    chapters: "chapitres",
    updated: "Mis à jour",
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
    recentBooks: "Недавние книги",
    createBook: "Создать книгу",
    noBooksYet: "Пока нет книг",
    noBooksDescription: "Создайте свою первую книгу, чтобы начать",
    words: "слов",
    chapters: "глав",
    updated: "Обновлено",
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
    recentBooks: "最近的书籍",
    createBook: "创建书籍",
    noBooksYet: "还没有书籍",
    noBooksDescription: "创建您的第一本书开始写作",
    words: "字",
    chapters: "章",
    updated: "更新于",
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
