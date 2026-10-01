"""Build the log-driven replay of every log in log_examples/ and report unhandled events and oracle mismatches.

Run: python scripts/replay_coverage.py   (about 30 s)
"""
import glob,collections,time,traceback
from ark_nova.parser import parse_log
from ark_nova.replay.config import game_from_log
from ark_nova.replay.builder import build_replay
t=time.time()
unh=collections.Counter(); mism=collections.Counter(); n=0; firstmism=[]; examples=[]; errors=collections.Counter()
for f in sorted(glob.glob('log_examples/*.json')):
    if '800035115' in f: continue
    p=parse_log(f); setup,cfg,seed=game_from_log(p)
    try:
        r=build_replay(p,setup,cfg,seed)
    except Exception as ex:
        errors[repr(ex)[:100]]+=1; continue
    n+=1
    unh.update(r.unhandled)
    if r.mismatches:
        firstmism.append(r.mismatches[0][0])
        if len(examples)<5: examples.append((f[-14:],r.mismatches[0]))
    for m in r.mismatches: mism[m[1][:34]]+=1
print(n,round(time.time()-t),'s errors',errors)
print('unhandled event types:',unh.most_common(30))
print('games with a mismatch:',len(firstmism),'first mismatch move (median):',sorted(firstmism)[len(firstmism)//2] if firstmism else None)
print(mism.most_common(6)); print(examples)
