import type { DraftSummary } from './draft-contracts.js';

export const draftEventTypes = ['draft.created', 'draft.updated', 'import.completed'] as const;
export type DraftEventType = typeof draftEventTypes[number];
export interface DraftEvent {
  id: string;
  type: DraftEventType;
  version: 1;
  occurredAt: Date;
  ownerId: string;
  data: Pick<DraftSummary, 'id' | 'kind' | 'questionCount' | 'updatedAt'>;
}
