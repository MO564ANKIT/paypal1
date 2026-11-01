import { motion } from 'framer-motion';
import { Lock, Star } from 'lucide-react';
import { MonsterStage } from '@/components/monsters/MonsterStage';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { cn } from '@/lib/cn';
import { getLevelProgress, stageName, type MonsterSpecies, type Rarity } from '@/lib/monsters';
import type { MonsterProgress } from '@/types';

const RARITY_STYLES: Record<Rarity, string> = {
  Common: 'border-white/20 bg-white/5 text-ink-200',
  Uncommon: 'border-aqua-400/40 bg-aqua-500/10 text-aqua-300',
  Rare: 'border-volt-400/40 bg-volt-500/10 text-volt-300',
  Epic: 'border-amber-400/40 bg-amber-500/10 text-amber-300',
};

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  return (
    <span className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider', RARITY_STYLES[rarity])}>
      {rarity}
    </span>
  );
}

interface MonsterCardProps {
  species: MonsterSpecies;
  progress: MonsterProgress;
  featured: boolean;
  onOpen: () => void;
}

export function MonsterCard({ species, progress, featured, onOpen }: MonsterCardProps) {
  const unlocked = progress.unlockedAt !== null;
  const info = getLevelProgress(progress.xp);

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'card group relative flex flex-col items-center p-5 text-center transition-shadow duration-300 hover:shadow-glow-volt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-400',
        !unlocked && 'opacity-80',
      )}
      aria-label={`${species.name}, ${unlocked ? `level ${info.level}` : 'locked'}`}
    >
      <div className="flex w-full items-center justify-between">
        <RarityBadge rarity={species.rarity} />
        {featured && (
          <span className="flex items-center gap-1 text-xs font-bold text-amber-300">
            <Star className="h-3.5 w-3.5 fill-amber-300" /> Featured
          </span>
        )}
      </div>

      <div className="my-4">
        <MonsterStage monsterId={species.id} level={info.level} stage={info.stage} locked={!unlocked} size="sm" />
      </div>

      <h3 className="text-lg font-bold text-ink-50">{species.name}</h3>
      <p className="mt-0.5 text-xs font-medium text-ink-300">
        {unlocked ? stageName(species.id, info.stage) : 'Locked silhouette'}
      </p>

      {unlocked ? (
        <div className="mt-4 w-full">
          <div className="mb-1.5 flex justify-between text-xs font-medium text-ink-300">
            <span>Level {info.level}</span>
            <span>{info.isMaxLevel ? 'Max level' : `${info.xpIntoLevel} / ${info.xpForNextLevel} XP`}</span>
          </div>
          <ProgressBar value={info.percent} tone="volt" height="sm" label={`${species.name} XP progress`} />
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs text-ink-300">
          <Lock className="h-3.5 w-3.5" /> Unlock: {species.unlockText}
        </p>
      )}
    </motion.button>
  );
}
