'use client'

// Autosave-on-blur (CRM-02) needs a real DOM event listener, which requires
// a Client Component boundary — Server Components cannot attach onBlur to a
// host element. useActionState wraps updateNotesAction (which resolves to
// { ok, error } for future inline-feedback use) into the void-returning
// `formAction` shape React's <form action> prop requires.
import { useActionState, useState } from 'react'
import { updateNotesAction } from './actions'

export default function NotesField({
  businessId,
  initialNotes,
}: {
  businessId: number
  initialNotes: string
}) {
  const [notes, setNotes] = useState(initialNotes)
  const [savedNotes, setSavedNotes] = useState(initialNotes.trim())
  const [savedThisSession, setSavedThisSession] = useState(false)
  const [state, formAction, pending] = useActionState(
    async (_prevState: Awaited<ReturnType<typeof updateNotesAction>>, formData: FormData) => {
      const result = await updateNotesAction(formData)
      if (result.ok) {
        const saved = String(formData.get('notes') ?? '')
        setSavedNotes(saved)
        setNotes(saved)
        setSavedThisSession(true)
      }
      return result
    },
    { ok: true as const },
  )
  const dirty = notes.trim() !== savedNotes
  const feedback = pending
    ? 'Saving…'
    : !state.ok
      ? state.error
      : dirty
        ? 'Unsaved changes'
        : savedThisSession
          ? 'Saved'
          : ''

  return (
    <form action={formAction}>
      <input type="hidden" name="businessId" value={businessId} />
      <textarea
        name="notes"
        aria-label="Lead notes"
        value={notes}
        placeholder="Add a note about this lead…"
        onChange={(event) => {
          setNotes(event.target.value)
          setSavedThisSession(false)
        }}
        onBlur={(event) => {
          const current = event.currentTarget.value
          const normalized = current.trim()
          if (normalized !== current) {
            event.currentTarget.value = normalized
          }
          if (normalized !== notes) setNotes(normalized)
          if (normalized !== savedNotes && !pending) {
            event.currentTarget.form?.requestSubmit()
          }
        }}
        rows={2}
        maxLength={2000}
        className="h-10 min-h-10 w-full min-w-40 resize-y border border-border bg-background p-2 text-sm outline-none transition-[height,border-color,box-shadow] focus:h-20 focus:border-accent focus:ring-2 focus:ring-focus motion-reduce:transition-none lg:h-auto lg:min-h-16"
      />
      <p
        aria-live="polite"
        className={`mt-1 min-h-4 text-xs ${!state.ok ? 'text-danger-foreground' : 'text-muted-foreground'}`}
      >
        {feedback}
      </p>
    </form>
  )
}
