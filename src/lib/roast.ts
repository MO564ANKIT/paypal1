import { CATEGORY_META, type Category } from '@/lib/categories';
import { monsterForCategory, getSpecies } from '@/lib/monsters';
import { formatMoney } from '@/lib/money';
import type { MonthSummary, Simulation } from '@/lib/finance';
import type { MonsterId } from '@/types';

export type Personality = 'softie' | 'savage' | 'big-brain' | 'unhinged';

export interface PersonalityInfo {
  id: Personality;
  label: string;
  tagline: string;
  greeting: string;
}

export const PERSONALITIES: PersonalityInfo[] = [
  {
    id: 'softie',
    label: 'Softie',
    tagline: 'Gentle nudges and big hugs',
    greeting: 'Hi, friend. Tell me what you are thinking about buying, or just ask for a check-in.',
  },
  {
    id: 'savage',
    label: 'Savage',
    tagline: 'Blunt, fast, no sugar coating',
    greeting: 'Go ahead. Show me the damage. I have seen worse, but not much worse.',
  },
  {
    id: 'big-brain',
    label: 'Big Brain',
    tagline: 'Numbers first, feelings second',
    greeting: 'Send me an amount or a purchase and I will show you the trade-offs with numbers.',
  },
  {
    id: 'unhinged',
    label: 'Unhinged',
    tagline: 'Chaotic energy, zero chill',
    greeting: 'WELCOME TO THE WALLET ARENA. Type a price. Let us see what your monsters do.',
  },
];

export interface RoastContext {
  summary: MonthSummary;
  streak: number;
  purchase?: { amountPaise: number; category: Category; simulation: Simulation };
  monsterId?: MonsterId;
}

const VERDICT_TEXT: Record<Simulation['verdict'], string> = {
  over: 'would go over the monthly budget',
  'category-over': 'would go over the category budget',
  tight: 'fits, but leaves very little room',
  fits: 'fits comfortably',
  'no-budget': 'cannot be checked because no budget is set',
};

export function buildRoastFacts(context: RoastContext): string[] {
  const { summary, streak, purchase, monsterId } = context;
  const facts: string[] = [];

  if (summary.remainingPaise === null) {
    facts.push('No monthly budget is set.');
  } else if (summary.remainingPaise < 0) {
    facts.push(`Over this month's budget by ${formatMoney(Math.abs(summary.remainingPaise))}.`);
  } else {
    facts.push(`Left in this month's budget: ${formatMoney(summary.remainingPaise)}.`);
  }
  if (summary.usedPercent !== null) facts.push(`Used ${summary.usedPercent}% of the monthly budget.`);
  if (summary.expenseCount === 0) facts.push('No expenses logged this month yet.');
  else facts.push(`Spent this month so far: ${formatMoney(summary.spentPaise)}.`);
  facts.push(`Current logging streak: ${streak} day(s).`);

  const topRoastable = summary.categories.find(
    (entry) => entry.spentPaise > 0 && CATEGORY_META[entry.category].roastable,
  );
  if (topRoastable) {
    facts.push(
      `Biggest flexible spending: ${CATEGORY_META[topRoastable.category].label} at ${formatMoney(topRoastable.spentPaise)}.`,
    );
  }

  const monsterName = monsterId
    ? getSpecies(monsterId).name
    : (purchase && monsterForCategory(purchase.category)?.name) ||
      (topRoastable && monsterForCategory(topRoastable.category)?.name) ||
      'the wallet';
  facts.push(`Spending monster in charge: ${monsterName}.`);

  if (purchase) {
    const sim = purchase.simulation;
    facts.push(
      `User is considering a ${formatMoney(purchase.amountPaise)} purchase in ${CATEGORY_META[purchase.category].label}. ` +
        `This ${VERDICT_TEXT[sim.verdict]}.`,
    );
    const remaining = sim.monthlyAfter ?? sim.categoryAfter;
    if (remaining !== null) facts.push(`Left after that purchase: ${formatMoney(Math.max(0, remaining))}.`);
    const over = Math.max(sim.monthlyOverPaise, sim.categoryOverPaise);
    if (over > 0) facts.push(`Would be over budget by ${formatMoney(over)}.`);
  }

  return facts;
}

const CATEGORY_KEYWORDS: { pattern: RegExp; category: Category }[] = [
  { pattern: /coffee|cafe|latte|chai|cold brew|tea/i, category: 'coffee' },
  { pattern: /food|swiggy|zomato|pizza|burger|dinner|lunch|snack|meal|takeout/i, category: 'food' },
  { pattern: /netflix|spotify|prime|subscription|ott|membership|youtube/i, category: 'subscriptions' },
  { pattern: /game|movie|concert|ticket|party|arcade|fun/i, category: 'fun' },
  { pattern: /rent|bill|electric|water|internet|phone plan/i, category: 'bills' },
];

export function guessCategory(text: string): Category {
  return CATEGORY_KEYWORDS.find((entry) => entry.pattern.test(text))?.category ?? 'shopping';
}
