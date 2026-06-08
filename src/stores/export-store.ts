import { create } from "zustand";

type ExportFormat = "docx" | "pdf" | "epub";
type ImportStep = "upload" | "analysis" | "review";

interface ImportWizardState {
  step: ImportStep;
  files: File[];
  result: {
    chapters: Array<{ number: number; title: string; wordCount: number }>;
    totalWordCount: number;
    warnings?: string[];
  } | null;
}

interface ExportState {
  // Import wizard
  importWizard: ImportWizardState;
  setImportStep: (step: ImportStep) => void;
  setImportFiles: (files: File[]) => void;
  setImportResult: (result: ImportWizardState["result"]) => void;
  resetImport: () => void;

  // Export
  selectedFormat: ExportFormat;
  isDraft: boolean;
  exportInProgress: boolean;
  lastExportResult: {
    filename: string;
    storageKey: string;
    wordCount: number;
    chapterCount: number;
    estimatedPages: number;
    warnings: string[];
    format: string;
  } | null;
  configPanelOpen: boolean;

  setSelectedFormat: (format: ExportFormat) => void;
  setIsDraft: (isDraft: boolean) => void;
  setExportInProgress: (inProgress: boolean) => void;
  setLastExportResult: (result: ExportState["lastExportResult"]) => void;
  setConfigPanelOpen: (open: boolean) => void;
  reset: () => void;
}

const defaultImportWizard: ImportWizardState = {
  step: "upload",
  files: [],
  result: null,
};

export const useExportStore = create<ExportState>((set) => ({
  importWizard: { ...defaultImportWizard },
  setImportStep: (step) =>
    set((s) => ({ importWizard: { ...s.importWizard, step } })),
  setImportFiles: (files) =>
    set((s) => ({ importWizard: { ...s.importWizard, files } })),
  setImportResult: (result) =>
    set((s) => ({ importWizard: { ...s.importWizard, result } })),
  resetImport: () => set({ importWizard: { ...defaultImportWizard } }),

  selectedFormat: "docx",
  isDraft: false,
  exportInProgress: false,
  lastExportResult: null,
  configPanelOpen: false,

  setSelectedFormat: (format) => set({ selectedFormat: format }),
  setIsDraft: (isDraft) => set({ isDraft }),
  setExportInProgress: (inProgress) => set({ exportInProgress: inProgress }),
  setLastExportResult: (result) => set({ lastExportResult: result }),
  setConfigPanelOpen: (open) => set({ configPanelOpen: open }),
  reset: () =>
    set({
      importWizard: { ...defaultImportWizard },
      selectedFormat: "docx",
      isDraft: false,
      exportInProgress: false,
      lastExportResult: null,
      configPanelOpen: false,
    }),
}));
