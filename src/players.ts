/** Reads a pasted list, one player per line, with an optional shirt number first: "7 Sam Carter" or "7. Sam". */
export function parsePlayerList(text: string): { name: string; number?: number }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^#?(\d{1,2})[\s.):-]+(.+)$/);
      return m ? { number: Number(m[1]), name: m[2].trim() } : { name: line };
    });
}
