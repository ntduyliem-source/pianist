/** Roles describe the score's declared credits; performer is never a composer fallback. */
export const creditRoles = [
  'composer',
  'lyricist',
  'arranger',
  'transcriber',
  'performer',
] as const;
export type CreditRole = (typeof creditRoles)[number];
export type ScoreCredits = Partial<Record<CreditRole, string>> & { aliases?: string[] };
export const creditLabels: Record<CreditRole, string> = {
  composer: 'Nhạc',
  lyricist: 'Lời',
  arranger: 'Chuyển soạn',
  transcriber: 'Chép lại',
  performer: 'Trình bày',
};

export function validScoreCredits(value: ScoreCredits): boolean {
  return (
    creditRoles.every(
      (role) =>
        value[role] === undefined ||
        (typeof value[role] === 'string' && !!value[role]!.trim() && value[role]!.length <= 300),
    ) &&
    (value.aliases === undefined ||
      (Array.isArray(value.aliases) &&
        value.aliases.length <= 20 &&
        value.aliases.every((a) => typeof a === 'string' && !!a.trim() && a.length <= 180)))
  );
}

export function scoreCredits(value?: ScoreCredits): ScoreCredits {
  if (!value) return {};
  return Object.fromEntries(
    [...creditRoles, 'aliases' as const]
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  );
}

export function creditSearch(value?: ScoreCredits): string {
  return value
    ? [...creditRoles.map((k) => value[k] ?? ''), ...(value.aliases ?? [])].join(' ')
    : '';
}

export function creditSummary(value?: ScoreCredits): string {
  return value
    ? creditRoles
        .filter((k) => value[k])
        .map((k) => `${creditLabels[k]}: ${value[k]}`)
        .join(' · ')
    : '';
}
