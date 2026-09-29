import type { Project } from '../types';
import { getBlocker } from './projectSignals';

const MAX_BLOCKER_CHARS = 2000;
const MAX_NOTES_CHARS = 200_000;

export type BlockerNoteResult =
  | { kind: 'changed'; notes: string }
  | { kind: 'noop'; notes: string }
  | {
      kind: 'error';
      reason: 'required' | 'line-break' | 'reserved' | 'too-long' | 'notes-too-long';
    };

export function updateBlockerNote(
  project: Project,
  text: string | null,
): BlockerNoteResult {
  const currentBlocker = getBlocker(project);
  if (text === null) {
    if (currentBlocker === null) return { kind: 'noop', notes: project.notes_md };
    return appendBlockerLine(project.notes_md, 'Blocker: none');
  }

  if (/[\r\n]/.test(text)) return { kind: 'error', reason: 'line-break' };
  const trimmedText = text.trim();
  if (!trimmedText) return { kind: 'error', reason: 'required' };
  if (/^none\.?$/i.test(trimmedText)) return { kind: 'error', reason: 'reserved' };
  if (trimmedText.length > MAX_BLOCKER_CHARS) {
    return { kind: 'error', reason: 'too-long' };
  }
  if (currentBlocker === trimmedText) return { kind: 'noop', notes: project.notes_md };

  return appendBlockerLine(project.notes_md, `Blocker: ${trimmedText}`);
}

function appendBlockerLine(notes: string, line: string): BlockerNoteResult {
  const updatedNotes = notes ? `${notes}\n${line}` : line;
  if (updatedNotes.length > MAX_NOTES_CHARS) {
    return { kind: 'error', reason: 'notes-too-long' };
  }
  return { kind: 'changed', notes: updatedNotes };
}
