/** Small display helpers shared by the interface and the log. */

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/** A weapon grade as a Roman numeral (1 to 5). */
export const roman = (grade: number): string => ROMAN[grade - 1] ?? String(grade);

/** "sabre" → "Sabre". */
export const kindLabel = (kind: string): string => kind.charAt(0).toUpperCase() + kind.slice(1);
