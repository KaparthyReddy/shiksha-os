/** Small deterministic PRNG so client and server derive identical orderings from one seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const arr = [...items];
  const rnd = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** FNV-1a mix, so each question's options get an independent shuffle from the session seed. */
export function derivedSeed(seed: number, salt: string): number {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  for (let i = 0; i < salt.length; i++) {
    h ^= salt.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function orderQuestions(questionIds: readonly string[], sessionSeed: number): string[] {
  return seededShuffle(questionIds, sessionSeed);
}

export function orderOptions(
  questionId: string,
  optionIds: readonly string[],
  sessionSeed: number,
): string[] {
  return seededShuffle(optionIds, derivedSeed(sessionSeed, questionId));
}
