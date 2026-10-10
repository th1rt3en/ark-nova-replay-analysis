/*
 * @Author: Ender Wiggin
 * @Date: 2026-02-22 00:14:04
 * @LastEditors: Ender Wiggin
 * @LastEditTime: 2026-02-22 00:47:33
 * @Description:
 */
import { Bonus } from '@/types/Bonus';
import { CardSource } from '@/types/CardSource';
import { Effect } from '@/types/Effect';
import { Tag } from '@/types/Tags';

export type TProjectSlotPosition = 1 | 2 | 3;
export interface ProjectSlot {
  position: TProjectSlotPosition;
  bonuses: Bonus[];
  indicator?: number;
}
export enum ProjectCategory {
  BASE = 'Base',
  NORMAL = 'Normal',
  RELEASE = 'Release',
  BREED = 'Breed',
  MARINE = 'Marine',
  FAN_MADE = 'Fan Made',
}

export interface ProjectCard {
  id: string;
  name: string;
  type: ProjectCategory;
  image?: string;
  directUseImage?: boolean;
  tag: Tag;
  slots: ProjectSlot[];
  placeBonuses: Bonus[];
  description: Effect;
  // meta data
  source: CardSource;
}
