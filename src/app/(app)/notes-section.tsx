import { Avatar } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { addNote } from "./shared-actions";

type NoteItem = {
  id: string;
  body: string;
  createdAt: Date;
  author: { name: string; avatarColor: string };
};

export function NotesSection({
  notes,
  target,
}: {
  notes: NoteItem[];
  target: { leadId?: string; dealId?: string; contactId?: string };
}) {
  const action = addNote.bind(null, target);

  return (
    <div>
      <form action={action} className="flex gap-2 mb-4">
        <input
          name="body"
          placeholder="Add a note..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          Add
        </button>
      </form>

      {notes.length === 0 ? (
        <p className="text-sm text-slate-400">No notes yet.</p>
      ) : (
        <ul className="space-y-4">
          {notes.map((note) => (
            <li key={note.id} className="flex gap-3">
              <Avatar name={note.author.name} color={note.author.avatarColor} size={7} />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-slate-800">{note.author.name}</span>
                  <span className="text-xs text-slate-400">{formatDateTime(note.createdAt)}</span>
                </div>
                <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{note.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
