import { getEditorHints } from '../core/editorHints';
import type { RunState } from '../core/types';
import type { GameData } from '../core/validate';

export function EditorNote({ data, run }: { data: GameData; run: RunState }) {
  const hints = getEditorHints(data, run);
  if (hints.length === 0) return null;
  return (
    <aside className="editor-note" aria-label="担当メモ">
      <span className="editor-note-label">担当メモ</span>
      {hints.map(hint => <p key={hint.id}>{hint.text}</p>)}
    </aside>
  );
}
