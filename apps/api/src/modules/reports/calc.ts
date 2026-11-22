/** Ties share a rank and the next rank skips (10, 10, 8 gives ranks 1, 1, 3). */
export function competitionRank(score: number, all: readonly number[]): number {
  return 1 + all.filter((s) => s > score).length;
}

/** Late counts as attended; excused days are left out of the denominator. */
export function attendancePercentage(present: number, late: number, absent: number): number | null {
  const denom = present + late + absent;
  return denom === 0 ? null : Math.round(((present + late) / denom) * 1000) / 10;
}

export type SubjectTotals = Map<string, { score: number; maxScore: number }>;

export function addToSubject(map: SubjectTotals, subject: string, score: number, maxScore: number): void {
  const cur = map.get(subject) ?? { score: 0, maxScore: 0 };
  map.set(subject, { score: cur.score + score, maxScore: cur.maxScore + maxScore });
}

export function subjectList(map: SubjectTotals) {
  return [...map.entries()]
    .map(([subject, t]) => ({ subject, score: Math.round(t.score * 100) / 100, maxScore: Math.round(t.maxScore * 100) / 100 }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}
