import part01 from "./vi/01"
import part02 from "./vi/02"
import part03 from "./vi/03"
import part04 from "./vi/04"
import part05 from "./vi/05"
import part06 from "./vi/06"
import part07 from "./vi/07"
import part08 from "./vi/08"
import part09 from "./vi/09"
import part10 from "./vi/10"
import part11 from "./vi/11"
import part12 from "./vi/12"
import part13 from "./vi/13"
import part14 from "./vi/14"
import extra from "./vi/extra"

/**
 * Vietnamese UI text, keyed by the English source string (see translate.ts).
 * Split alphabetically into parts only to keep files a manageable size;
 * `extra` holds keys added after the initial translation.
 */
export const vi: Readonly<Record<string, string>> = {
  ...part01,
  ...part02,
  ...part03,
  ...part04,
  ...part05,
  ...part06,
  ...part07,
  ...part08,
  ...part09,
  ...part10,
  ...part11,
  ...part12,
  ...part13,
  ...part14,
  ...extra,
}
