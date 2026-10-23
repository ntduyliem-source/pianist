import definition from '../../../../scores/grades/definition.json';

// The same committed edition is read by the Python source/publish validators.
export const GRADE_DEFINITION = definition;
export const GRADES = definition.grades;
export const GRADE_IDS = GRADES.map((grade) => grade.id);
export const LENGTH_BUCKETS = definition.lengthBuckets;
export const LENGTHS = LENGTH_BUCKETS.map((bucket) => bucket.id);
export const EXERCISES_PER_OPTION = definition.exercisesPerOption;
export const OPTION_COUNT = GRADES.length * LENGTH_BUCKETS.length;
export const TOTAL_EXERCISES = OPTION_COUNT * EXERCISES_PER_OPTION;

export function scoreIdentityMatches(scoreId: string, grade: number, bucket: string) {
  if (!GRADE_IDS.includes(grade) || !LENGTHS.includes(bucket)) return false;
  const prefix = `g${grade}-${bucket}-`;
  if (!scoreId.startsWith(prefix)) return false;
  const suffix = scoreId.slice(prefix.length);
  return /^\d{3}$/.test(suffix) && Number(suffix) >= 1 && Number(suffix) <= EXERCISES_PER_OPTION;
}
