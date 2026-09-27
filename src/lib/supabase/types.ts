import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

/** Typed Supabase client passed into service functions. */
export type DbClient = SupabaseClient<Database>
