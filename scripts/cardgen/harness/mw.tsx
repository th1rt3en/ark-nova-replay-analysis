import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import data from '../../../src/ark_nova/data/projects.json';
import ConservationIcon from '@/components/icons/tokens/ConservationIcon';
import ReputationIcon from '@/components/icons/tokens/ReputationIcon';
import TagIcon from '@/components/icons/tokens/TagIcon';
import AbilityIcon from '@/components/icons/abilities/AbilityIcon';
import Posturing from '@/components/icons/abilities/Posturing';
import Clever from '@/components/icons/actions/Clever';
import {IconName} from '@/types/IconName';
import {ProjectCard} from '@/components/cards/project_cards/ProjectCard';
import {ProjectCategory} from '@/types/ProjectCard';
import {useTranslation} from 'next-i18next';
const TAG:any={seaAnimal:'Sea Animal',predator:'Predator',bird:'Bird',reptile:'Reptile',herbivore:'Herbivore',primate:'Primate',science:'Science'};
import {AnimalTag,OtherTag} from '@/types/Tags';
const tag=(k:string)=>({seaAnimal:AnimalTag.SeaAnimal,predator:AnimalTag.Predator,bird:AnimalTag.Bird,reptile:AnimalTag.Reptile,herbivore:AnimalTag.Herbivore,primate:AnimalTag.Primate,science:OtherTag.Science} as any)[k];
const Kw=({k,v}:{k:string,v?:any})=>k==='hunter'?<AbilityIcon iconName={IconName.HUNTER} value={String(v??'')}/>:k==='sunbathing'?<AbilityIcon iconName={IconName.SUN_BATHING} value={String(v??'')}/>:k==='digging'?<AbilityIcon iconName={IconName.DIGGING} value={String(v??'')}/>:k==='posturing'?<Posturing/>:k==='clever'?<Clever/>:<span>{k}</span>;
const Bonus=({b}:{b:any})=>{
  if(b.bonusType==='Conservation Point')return <ConservationIcon value={b.bonusValue}/>;
  if(b.bonusType==='Keyword')return <Kw k={b.keyword} v={b.bonusValue}/>;
  if(b.bonusType==='Activate Reef')return <div className='icon-container'><div className='arknova-icon icon-reef-effect mw-reef'/></div>;
  if(b.bonusType==='Reputation'){return b.per?<div className='mw-rep'><div className='mw-sci'><TagIcon type={tag(b.per.tag)}/><TagIcon type={tag(b.per.tag)}/></div><span className='mw-colon'>:</span><ReputationIcon value={b.bonusValue}/></div>:<ReputationIcon value={b.bonusValue}/>;}
  if(b.bonusType==='Tutor')return <div className='mw-tutor'><TagIcon type={tag(b.tag)}/><i/></div>;
  return <span>{b.bonusType}</span>;
};
const Plan=({p}:{p:any})=>{
  const {t}=useTranslation('common');const name=p.name;
  const reqTag=tag(p.requirement.tag);
  const camel=(s:string)=>s.toLowerCase().replace(/(^|[^a-z])([a-z])/g,(_:any,__:any,c:string)=>c.toUpperCase());
  const dataId=`P${p.id}_${camel(name)}`;
  return <div id={`card-${dataId}`} data-id={dataId} className='ark-card zoo-card project-card mw-plan tooltipable'><div className='ark-card-wrapper'>
    <div className='ark-card-top'><div className='ark-card-top-left'><div className='project-card-top-left-icon wide mw-two'><TagIcon type={reqTag}/><TagIcon type={reqTag}/></div></div><div className='ark-card-top-right'/></div>
    <div className='ark-card-middle'><div className='ark-card-number sf-hidden'>{p.id}</div><div className='ark-card-title-wrapper'><div className='ark-card-title'>{name}</div></div></div>
    <div className='ark-card-bottom'>
      <div className='project-card-description sf-hidden'>Requires {p.requirement.count} <b>{TAG[p.requirement.tag].toLowerCase()}</b> icons.</div>
      <div className='project-card-slots-container mw'>{p.slots.map((s:any,i:number)=><div key={i} className='project-card-slot'><div className='project-card-slot-reward mw-reward'>{s.bonuses.map((b:any,j:number)=><div key={j} className='mw-b'><Bonus b={b}/></div>)}</div></div>)}</div>
      <div className='zoo-card-bonuses mw-place' data-size='1'><div className='mw-place-in'>{p.placeBonuses.map((b:any,j:number)=><Bonus key={j} b={b}/>)}</div></div>
    </div></div></div>;
};
(globalThis as any).renderMW=(id:string)=>{
  const p=(data as any).find?(data as any).find((x:any)=>x.key==='P'+id):((data as any).projects||[]).find((x:any)=>x.key==='P'+id);
  if(!p)return null;
  if(p.type==='Management')return renderToStaticMarkup(<Plan p={p}/>);
  const c={...p,type:ProjectCategory.BASE,tag:tag(p.tag),placeBonuses:[],description:{effectType:'conservation',effectDesc:''}};
  return renderToStaticMarkup(<ProjectCard project={c as any}/>);
};
