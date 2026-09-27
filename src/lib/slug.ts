/** "Thì hiện tại đơn – Present Simple" -> "thi-hien-tai-don-present-simple" (web addresses). */
export function slugify(text: string, max = 80) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "")
}
