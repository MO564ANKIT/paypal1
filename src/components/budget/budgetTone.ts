import type { Tone } from '@/components/ui/ProgressBar';

export function budgetTone(percent: number | null): Tone {
  if (percent === null) return 'aqua';
  if (percent >= 100) return 'rose';
  if (percent >= 80) return 'amber';
  return 'neon';
}
