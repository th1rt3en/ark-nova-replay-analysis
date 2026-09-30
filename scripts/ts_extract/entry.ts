// Bundled with esbuild (see scripts/import_data.py) and run under node to dump the upstream TS data as JSON.
import { AnimalsData } from '@/data/Animals';
import { SponsorsData } from '@/data/Sponsors';
import { ProjectsData } from '@/data/Projects';
import { EndGameData } from '@/data/EndGames';
import { MapBoards } from '@/data/MapBoards';
import { AlternativeMapBoards } from '@/data/AlternativeMapBoards';
import { PROJECT_BONUSES } from '@/data/ProjectBonuses';
import { cardNames } from '@/data/CardNames';

process.stdout.write(
  JSON.stringify({
    animals: AnimalsData,
    sponsors: SponsorsData,
    projects: ProjectsData,
    endgames: EndGameData,
    maps: [...MapBoards, ...AlternativeMapBoards],
    projectBonuses: PROJECT_BONUSES,
    cardNames,
  }),
);
