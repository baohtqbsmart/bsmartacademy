/**
 * Normalises a search term the same way the database builds `search_text`
 * (lower(unaccent(...))): "Nguyễn Đức" -> "nguyen duc".
 */
export function normalizeSearch(input: string) {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Escapes LIKE wildcards so user input is matched literally. */
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}
