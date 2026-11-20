// Which dialog is open, and what it was opened with.
import { create } from 'zustand';
import type { EventCategory, Occ } from '../../types';

export type ModalState =
  | null
  | { kind: 'occ'; occ: Occ }
  | { kind: 'task'; id?: string; start?: Date; end?: Date; moduleId?: string; activityId?: string }
  | {
      kind: 'event';
      id?: string;
      start?: Date;
      end?: Date;
      category?: EventCategory;
      moduleId?: string;
      activityId?: string;
    }
  | { kind: 'class'; id?: string; moduleId?: string }
  | { kind: 'module'; id?: string; semesterId?: string }
  | { kind: 'semester'; id?: string }
  | { kind: 'routine'; id?: string }
  | { kind: 'activity'; id?: string }
  | { kind: 'newChoice'; start: Date; end: Date }
  | { kind: 'away'; id?: string; start?: Date; end?: Date }
  | { kind: 'nusmods'; semesterId: string };

type OpenModal = Exclude<ModalState, null>;
export type ModalKind = OpenModal['kind'];
export type ModalOf<K extends ModalKind> = Extract<OpenModal, { kind: K }>;

export const useUI = create<{ modal: ModalState; open: (m: ModalState) => void; close: () => void }>((set) => ({
  modal: null,
  open: (modal) => set({ modal }),
  close: () => set({ modal: null }),
}));

/**
 * The open dialog's state, typed for the dialog that asks.
 * Only ModalHost renders a dialog, and only for its own kind, so the narrowing is safe.
 */
export function useModal<K extends ModalKind>(_kind: K): ModalOf<K> {
  return useUI((s) => s.modal) as ModalOf<K>;
}
