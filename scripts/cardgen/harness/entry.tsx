import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AnimalsData} from '@/data/Animals';
import {SponsorsData} from '@/data/Sponsors';
import {ProjectsData} from '@/data/Projects';
import {EndGameData} from '@/data/EndGames';
import {BaseAnimalCard} from '@/components/cards/animal_cards/BaseAnimalCard';
import {BaseSponsorCard} from '@/components/cards/sponsor_cards/BaseSponsorCard';
import {ProjectCard} from '@/components/cards/project_cards/ProjectCard';
import {BaseEndGameCard} from '@/components/cards/endgame_cards/BaseEndGameCard';
import ours from '../../../src/ark_nova/data/projects.json';
import {AnimalTag} from '@/types/Tags';
import {ProjectCategory as PC} from '@/types/ProjectCard';
const ourP:any=(ours as any);
(globalThis as any).renderCard=(kind:string,idRaw:string)=>{
  const mw=idRaw.endsWith('_MW');const id=idRaw.replace('_MW','');
  if(kind==='A'){const c=AnimalsData.find(x=>x.id===id);return c?renderToStaticMarkup(<BaseAnimalCard animal={c as any}/>):null;}
  if(kind==='S'){const c:any=SponsorsData.find(x=>x.id===id);if(!c)return null;
    const d=mw&&id==='250'?{...c,water:2,tags:[AnimalTag.Reptile,AnimalTag.SeaAnimal]}:c;
    return renderToStaticMarkup(<BaseSponsorCard sponsor={d}/>);}
  if(kind==='P'){const c:any=(ProjectsData as any[]).find(x=>x.id===id);if(!c)return null;
    const o=ourP.find((x:any)=>x.key==='P'+id);let slots=o?o.slots:c.slots;
    if(mw&&id==='131')slots=MW131;
    return renderToStaticMarkup(<ProjectCard project={{...c,slots}}/>);}
  if(kind==='F'){const c=(EndGameData as any[]).find(x=>x.id===id);return c?renderToStaticMarkup(<BaseEndGameCard card={c}/>):null;}
};
import variants from '../../../data_manual/variants_mw.json';
const MW131=(variants as any).variants.P131.marine_worlds.slots;
import './mw';
