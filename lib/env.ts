import 'server-only'
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.url(),
  PLACES_API_KEY: z.string().min(1),
})

// Throws at import time (server startup / first server-side import) if either
// var is missing or malformed — fail fast, not a silent undefined deep in a
// route handler. This is the sole sanctioned `process.env` read in the
// codebase; every other server-side module imports `env` from here.
export const env = envSchema.parse(process.env)
