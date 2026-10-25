import { creditLabels, creditRoles, type ScoreCredits as Credits } from '../score-metadata';
import './score-credits.css';

export function ScoreCredits({ value, compact = false }: { value?: Credits; compact?: boolean }) {
  if (!value) return null;
  const roles = compact
    ? creditRoles.filter(
        (k) =>
          k === (value.composer ? 'composer' : 'lyricist') ||
          k === (value.arranger ? 'arranger' : 'transcriber'),
      )
    : creditRoles;
  if (!roles.some((k) => value[k])) return null;
  return (
    <dl className="score-credits">
      {roles
        .filter((k) => value[k])
        .map((k) => (
          <div key={k} data-credit-role={k} title={`${creditLabels[k]}: ${value[k]}`}>
            <dt>{creditLabels[k]}</dt>
            <dd>{value[k]}</dd>
          </div>
        ))}
    </dl>
  );
}
