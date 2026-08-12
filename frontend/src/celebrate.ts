import confetti from 'canvas-confetti';

export function celebrate(colors?: readonly string[]): void {
  const cannon = confetti.create(undefined, { resize: true });
  void cannon({
    particleCount: 100,
    spread: 90,
    origin: { y: 1, x: 0.5 },
    colors: colors ? [...colors] : undefined,
  });
}
