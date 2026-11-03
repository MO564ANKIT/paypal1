import type { MonsterId } from '@/types';

export const MONSTER_ASSET_DIR = '/assets/monsters';

export const MONSTER_IMAGE_SOURCES: Record<MonsterId, readonly string[]> = {
  shopzilla: [`${MONSTER_ASSET_DIR}/shopzilla.webp`, `${MONSTER_ASSET_DIR}/shopzilla.png`],
  coffeeling: [`${MONSTER_ASSET_DIR}/coffeeling.webp`, `${MONSTER_ASSET_DIR}/coffeeling.png`],
  munchlord: [`${MONSTER_ASSET_DIR}/munchlord.webp`, `${MONSTER_ASSET_DIR}/munchlord.png`],
  saverion: [`${MONSTER_ASSET_DIR}/saverion.webp`, `${MONSTER_ASSET_DIR}/saverion.png`],
  napcoin: [`${MONSTER_ASSET_DIR}/napcoin.webp`, `${MONSTER_ASSET_DIR}/napcoin.png`],
  impulso: [`${MONSTER_ASSET_DIR}/impulso.webp`, `${MONSTER_ASSET_DIR}/impulso.png`],
};
