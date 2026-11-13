// Case-insensitive literal search, shared by the transcript filter and its
// highlighting so a line is shown exactly when something in it is marked.

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

function escapeTerm(term: string): string {
  return term.replace(REGEX_SPECIAL, "\\$&");
}

export function containsTerm(text: string, term: string): boolean {
  return term === "" || new RegExp(escapeTerm(term), "i").test(text);
}

// Splits text around every match of `term`; odd indexes are the matches.
export function splitByTerm(text: string, term: string): string[] {
  if (term === "") return [text];
  return text.split(new RegExp(`(${escapeTerm(term)})`, "gi"));
}
