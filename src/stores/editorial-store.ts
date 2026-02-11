import { create } from "zustand";

interface EditorialFilters {
  severity: string | null;
  category: string | null;
  status: string | null;
  agentType: string | null;
}

interface EditorialState {
  selectedChapter: number | null;
  selectedFindingId: string | null;
  filters: EditorialFilters;
  activeTab: "findings" | "history" | "summary";

  setSelectedChapter: (chapter: number | null) => void;
  setSelectedFinding: (findingId: string | null) => void;
  setFilter: (key: keyof EditorialFilters, value: string | null) => void;
  resetFilters: () => void;
  setActiveTab: (tab: "findings" | "history" | "summary") => void;
  reset: () => void;
}

const defaultFilters: EditorialFilters = {
  severity: null,
  category: null,
  status: null,
  agentType: null,
};

export const useEditorialStore = create<EditorialState>((set) => ({
  selectedChapter: null,
  selectedFindingId: null,
  filters: { ...defaultFilters },
  activeTab: "findings",

  setSelectedChapter: (chapter) =>
    set({ selectedChapter: chapter, selectedFindingId: null }),

  setSelectedFinding: (findingId) =>
    set({ selectedFindingId: findingId }),

  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    })),

  resetFilters: () => set({ filters: { ...defaultFilters } }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  reset: () =>
    set({
      selectedChapter: null,
      selectedFindingId: null,
      filters: { ...defaultFilters },
      activeTab: "findings",
    }),
}));
