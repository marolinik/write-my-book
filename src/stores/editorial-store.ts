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
  highlightedFindingId: string | null;
  filters: EditorialFilters;
  activeTab: "findings" | "history" | "summary";
  conversationFindingId: string | null;

  setSelectedChapter: (chapter: number | null) => void;
  setSelectedFinding: (findingId: string | null) => void;
  setHighlightedFinding: (id: string | null) => void;
  setFilter: (key: keyof EditorialFilters, value: string | null) => void;
  resetFilters: () => void;
  setActiveTab: (tab: "findings" | "history" | "summary") => void;
  setConversationFinding: (id: string | null) => void;
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
  highlightedFindingId: null,
  filters: { ...defaultFilters },
  activeTab: "findings",
  conversationFindingId: null,

  setSelectedChapter: (chapter) =>
    set({ selectedChapter: chapter, selectedFindingId: null }),

  setSelectedFinding: (findingId) =>
    set({ selectedFindingId: findingId }),

  setHighlightedFinding: (id) =>
    set({ highlightedFindingId: id }),

  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    })),

  resetFilters: () => set({ filters: { ...defaultFilters } }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setConversationFinding: (id) => set({ conversationFindingId: id }),

  reset: () =>
    set({
      selectedChapter: null,
      selectedFindingId: null,
      highlightedFindingId: null,
      filters: { ...defaultFilters },
      activeTab: "findings",
      conversationFindingId: null,
    }),
}));
