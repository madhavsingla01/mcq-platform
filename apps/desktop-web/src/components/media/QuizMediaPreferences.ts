import { createContext } from 'react';

interface MediaPreferences {
  captions?: boolean;
  speed?: number;
  transcripts?: { open: boolean; sequence?: number };
}

export const QuizMediaPreferences = createContext<MediaPreferences | null>(null);
