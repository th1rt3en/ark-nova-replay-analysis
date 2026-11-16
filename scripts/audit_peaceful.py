"""For every log in log_examples/: which signs of the peaceful variant show and whether a hostile event shows too (a sign that co-occurs with a hostile
event proves nothing). Usage: python scripts/audit_peaceful.py [out.json]"""
import glob,sys,json
from collections import Counter
from pathlib import Path
from ark_nova import data
from ark_nova.parser import parse_log
from ark_nova.replay.config import HOSTILE
res={}
for path in sorted(glob.glob(str(Path(__file__).resolve().parents[1] / "log_examples" / "*.json"))):
    tb=Path(path).stem
    try: parsed=parse_log(path)
    except Exception as ex: continue
    played=Counter(); hostile=Counter(); ev=Counter(); names=set(); inv=False
    for m in parsed.moves:
        for e in m.events:
            a=e.args if isinstance(e.args,dict) else {}
            if e.type=="chooseActionCard": names=set()
            if e.type in("pilfering","pilferingMoney","pilferingCard","hypnosis"): hostile[e.type]+=1
            elif e.type=="addMeeples" and ("Venom effect" in e.log or "Constriction effect" in e.log): hostile["meeples"]+=1
            elif e.type=="midmessage" and "not affected by" in e.log and any(h in e.log for h in("Constriction","Venom","Pilfering","Hypnosis")): hostile["immune"]+=1
            if e.type=="buyAnimal" and isinstance(a.get("card"),dict):
                card=data.cards_by_key()[data.parse_bga_card_id(a["card"]["id"])[0]]
                own={x["keyword"]["name"] for x in card.get("abilities") or []}|{x["keyword"]["name"] for x in card.get("reefDwellerEffect") or []}
                inv=inv or "Inventive" in own; names|=own
                for h in own&HOSTILE: played[h]+=1
            elif names:
                b=a.get("bonuses") or {}
                if e.type=="getBonuses" and "Venom" in names and "Inventive" not in names and not inv and a.get("source")=="Inventive" and set(b)=={"xtoken"}: ev["venom_xtoken"]+=1
                if e.type=="getBonuses" and "Pilfering 1" in names and set(b)=={"money"} and b["money"]==3 and not a.get("card_id") and not a.get("source"): ev["pilf1_money3"]+=1
                if e.type=="actionCardCleanup" and "Constriction" in names and "Clever" not in names and "Clever effect" in e.log: ev["constr_clever"]+=1
                if e.type=="pDrawCards" and ("Pilfering 2" in names or "Pilfering 1" in names) and "Sprint" not in names and "sprint" in e.log: ev["pilf_sprint"]+=1
    res[tb]={"played":dict(played),"hostile":dict(hostile),"ev":dict(ev)}
json.dump(res,open(sys.argv[1] if len(sys.argv) > 1 else "peace_audit.json","w"))
tot=Counter(); both=Counter()
for tb,r in res.items():
    for k in r["ev"]:
        tot[k]+=1
        if r["hostile"]: both[k]+=1
print("games with each evidence:",dict(tot)); print("...that also show a hostile event:",dict(both))
