import "server-only"

import { fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

/** Published words of the academy word bank (dictionary.read, checked in SQL). */
export async function searchDictionary(db: DbClient, query: string) {
  const { data, error } = await db.rpc("dictionary_search", { query: query.slice(0, 100), max_rows: 40 })
  if (error) throw fromPostgrestError(error)
  return data
}

export type DictionaryEntry = Awaited<ReturnType<typeof searchDictionary>>[number]
