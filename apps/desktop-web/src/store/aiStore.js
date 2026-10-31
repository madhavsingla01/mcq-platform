import { create } from 'zustand';

export const useAIStore = create((set, get) => ({
  isOpen: false,
  mode: 'expanded', // 'compact' | 'expanded' | 'fullscreen'
  messagesByQuestionId: {}, // { [questionId]: [ { role: 'user'|'assistant', content: string } ] }
  isTyping: false,

  // Actions
  setIsOpen: (isOpen) => set({ isOpen }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setMode: (mode) => set({ mode }),

  // Chat Actions
  addMessage: (questionId, role, content) => {
    set((state) => {
      const history = state.messagesByQuestionId[questionId] || [];
      return {
        messagesByQuestionId: {
          ...state.messagesByQuestionId,
          [questionId]: [...history, { id: Date.now().toString(), role, content }],
        },
      };
    });
  },

  setIsTyping: (isTyping) => set({ isTyping }),

  // Helper to init the first explanation message for a question
  initExplanation: (questionId, explanationText) => {
    set((state) => {
      const history = state.messagesByQuestionId[questionId];
      if (history && history.length > 0) return state; // Already initialized

      return {
        messagesByQuestionId: {
          ...state.messagesByQuestionId,
          [questionId]: [
            {
              id: `init-${questionId}`,
              role: 'assistant',
              content: explanationText || "I'm ready to explain this concept further. What would you like to know?",
            },
          ],
        },
      };
    });
  },
}));
