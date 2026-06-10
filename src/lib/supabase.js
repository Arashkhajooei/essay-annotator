import { createClient } from '@supabase/supabase-js'

// Publishable key only — safe to ship in the browser. RLS guards all data access.
export const SUPABASE_URL = 'https://ibylxunqtpbuobvjwxoz.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_X_eoA7uToTLjHIiNobB2yg_sCbkXD-y'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

export const PROJECT_REF = 'ibylxunqtpbuobvjwxoz'
export const SQL_EDITOR_URL = `https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`
