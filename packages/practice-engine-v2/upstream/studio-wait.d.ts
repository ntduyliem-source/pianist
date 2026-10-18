export function createStudioWait(): {
  setTargets(notes: {id: string; midi: number; staffId: number}[]): void;
  input(midi: number, pressed: boolean): {ids: string[]; wrong: boolean; advanced: boolean};
  resetKeys(): void;
  readonly scores: {correct: number; wrong: number};
};
