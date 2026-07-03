'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { updateBusinessNotes, setBusinessContacted } from '@/lib/db/businesses'

const notesSchema = z.object({
  businessId: z.coerce.number().int().positive(),
  notes: z.string().trim().max(2000),
})

// Deliberately NOT z.coerce.boolean(): Zod's boolean coercion runs
// `Boolean(input)`, so the string "false" (a non-empty string) would
// coerce to `true` — the opposite of the intended value. Mapping the
// literal "true"/"false" strings explicitly avoids that footgun.
const contactedSchema = z.object({
  businessId: z.coerce.number().int().positive(),
  contacted: z.enum(['true', 'false']).transform((v) => v === 'true'),
})

export async function updateNotesAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = notesSchema.safeParse({
    businessId: formData.get('businessId'),
    notes: formData.get('notes'),
  })

  if (!parsed.success) {
    return { ok: false, error: 'Invalid input' }
  }

  await updateBusinessNotes(parsed.data.businessId, parsed.data.notes)
  revalidatePath('/leads')
  return { ok: true }
}

export async function setContactedAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = contactedSchema.safeParse({
    businessId: formData.get('businessId'),
    contacted: formData.get('contacted'),
  })

  if (!parsed.success) {
    return { ok: false, error: 'Invalid input' }
  }

  await setBusinessContacted(parsed.data.businessId, parsed.data.contacted)
  revalidatePath('/leads')
  return { ok: true }
}
