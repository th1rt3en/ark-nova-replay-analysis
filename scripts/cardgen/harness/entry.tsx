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
const MWO=(c:any,html:string|null)=>html&&c&&c.source==='Marine World'?html.replace('class="ark-card zoo-card ','class="ark-card zoo-card mw-only '):html;   // (cards that exist only in Marine Worlds: the seahorse on the name stripe, site/mw.css)
(globalThis as any).renderCard=(kind:string,idRaw:string)=>MWO(cardOf(kind,idRaw),renderCard0(kind,idRaw));
const cardOf=(kind:string,idRaw:string)=>{const id=idRaw.replace('_MW','').replace('_VC','');return kind==='A'?AnimalsData.find(x=>x.id===id):kind==='S'?SponsorsData.find(x=>x.id===id):kind==='F'?(EndGameData as any[]).find(x=>x.id===id):kind==='P'?(ProjectsData as any[]).find(x=>x.id===id):null;};
const named=(kind:string,id:string,c:any)=>{const f=(nameFixes as any)[kind+id];return c&&f?{...c,...f}:c;};   // (BGA's names for the cards where the fan site's data differs: data_manual/card_names.json, the same file scripts/import_data.py applies to our data)
const renderCard0=(kind:string,idRaw:string)=>{
  const mw=idRaw.endsWith('_MW'),vc=idRaw.endsWith('_VC');const id=idRaw.replace('_MW','').replace('_VC','');
  if(kind==='A'){const c=named('A',id,AnimalsData.find(x=>x.id===id));return c?renderToStaticMarkup(<BaseAnimalCard animal={c as any}/>):null;}
  if(kind==='S'){const c:any=named('S',id,SponsorsData.find(x=>x.id===id));if(!c)return null;
    const d=mw&&id==='250'?{...c,water:2,tags:[AnimalTag.Reptile,AnimalTag.SeaAnimal]}:c;
    const d2=vc&&id==='274'?{...d,name:'VICTORY COLUMN'}:d;                                   // (S274_VC: the BGA name Victory Column, with the picture of the incumbent Emu Cup winner: scripts/build_victory_column_art.py)
    let html=renderToStaticMarkup(<BaseSponsorCard sponsor={d2}/>);
    html=html.replace(/(<div class="arknova-icon icon-appeal">)(\d{2,})<\/div>/g,'$1<span class="icon-num-2">$2</span></div>');   // (two-digit numbers in the appeal ticket, e.g. Arcade's 10: drawn a little smaller, see site/mw.css)
    if(id==='227')html=html.replace('Choose and mark on this card.','Choose and mark <img class="waza-card" src="/img/waza_2minus.png" alt=""/> or <img class="waza-card" src="/img/waza_4plus.png" alt=""/> on this card.');   // (S227: the two card kinds as small icons in the text, see site/mw.css)
    return vc&&id==='274'?emuCup(html):html;}               // (another data-id: site/mw.css gives S274_EmuCup its own face, art/S274_VC.jpg)
  if(kind==='P'){const c:any=(ProjectsData as any[]).find(x=>x.id===id);if(!c)return null;
    const o=ourP.find((x:any)=>x.key==='P'+id);let slots=o?o.slots:c.slots;
    if(mw&&id==='131')slots=MW131;
    return renderToStaticMarkup(<ProjectCard project={{...c,slots}}/>);}
  if(kind==='F'){const c=(EndGameData as any[]).find(x=>x.id===id);return c?renderToStaticMarkup(<BaseEndGameCard card={c}/>):null;}
};
import variants from '../../../data_manual/variants_mw.json';
import nameFixes from '../../../data_manual/card_names.json';
import emu from '../../../web/emu_cup_winners/winners.json';
// S274_VC: another data-id (site/mw.css gives S274_EmuCup its own face, art/S274_VC.jpg) and the caption on the photo that names the incumbent Emu Cup champion (the newest season of winners.json); the small cards hide it (site/compact.css)
const LAUREL="<svg viewBox='0 0 40 34' fill='none' stroke='#8a4a2a' stroke-width='3' stroke-linecap='round'><path d='M20 31C9 29 4 21 5 8M20 31c11-2 16-10 15-23'/><path d='M8 14c-3-1-4-3-4-6 3 0 5 2 4 6zM10 21c-3 0-5-2-5-5 3-1 5 1 5 5zM15 27c-3 1-5-1-6-4 3-1 5 1 6 4zM32 14c3-1 4-3 4-6-3 0-5 2-4 6zM30 21c3 0 5-2 5-5-3-1-5 1-5 5zM25 27c3 1 5-1 6-4-3-1-5 1-6 4z' fill='#8a4a2a' stroke='none'/></svg>";
const emuCup=(html:string)=>{const w:any=[...(emu as any).winners].sort((a:any,b:any)=>b.season-a.season)[0];
  const cap=`<div class="emu-caption">${LAUREL}<span>${(emu as any).event} Chanpion: <b>${w.name}</b> <i>(Season ${w.season})</i></span></div>`;
  return html.replace(/S274_MascotStatue/g,'S274_EmuCup').replace('sponsor_strips/S274_EmuCup','sponsor_strips/S274_MascotStatue').replace('<div class="ark-card-wrapper">','<div class="ark-card-wrapper">'+cap);};
const MW131=(variants as any).variants.P131.marine_worlds.slots;
import './mw';
