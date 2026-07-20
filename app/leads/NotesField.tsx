'use client'

// Autosave-on-blur (CRM-02) needs a real DOM event listener, which requires
// a Client Component boundary — Server Components cannot attach onBlur to a
// host element. useActionState wraps updateNotesAction (which resolves to
// { ok, error } for future inline-feedback use) into the void-returning
// `formAction` shape React's <form action> prop requires.
import { useActionState } from 'react'
import { updateNotesAction } from './actions'

export default function NotesField({
  businessId,
  initialNotes,
}: {
  businessId: number
  initialNotes: string
}) {
  const [, formAction] = useActionState(
    (_prevState: Awaited<ReturnType<typeof updateNotesAction>>, formData: FormData) =>
      updateNotesAction(formData),
    { ok: true as const },
  )

  return (
    <form action={formAction}>
      <input type="hidden" name="businessId" value={businessId} />
      <textarea
        name="notes"
        defaultValue={initialNotes}
        placeholder="Add a note about this lead…"
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        rows={2}
        className="w-full min-w-40 rounded border border-border bg-background p-1 text-sm"
      />
    </form>
  )
}
