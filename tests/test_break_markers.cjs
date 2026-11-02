// Run with: node tests/test_break_markers.cjs (no npm or browser required).
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'web/js/results.js'), 'utf8');
const graphCode = source.slice(source.indexOf('const metric ='), source.indexOf('let raceSeq'));
const statsCode = source.slice(source.indexOf('const UNIQUE ='), source.indexOf('function hexes('));
const graph = (replay) => new Function('S', graphCode + ';return race;')({replay});
const stats = new Function('S', statsCode + ';return countStats;')({replay:{steps:[]}});
const player = (money) => ({money,score:0,appeal:0,conservation:0,reputation:1,x_tokens:0});
const values = (money) => [player(money),player(money)];
const sample = (number,money,seat=0) => ({number,seat,players:values(money)});
const step = (label,money,phase='turn') => ({label,state:{turn:2,phase,turn_context:{display:1},players:values(money)}});
const base = {players:[{name:'Alice'},{name:'Bob'}],turn_start:values(25),normal_turns:[sample(1,20),sample(2,40)],steps:[step('Unrelated translated/folded label',40)]};

const markers = [{start_move:7,end_move:9,turn:1.5,seat:1}];
const structured = graph({...base,break_markers:markers})('money');
assert.deepEqual(structured.breaks,[{turn:1.5,seat:1}]);
assert.deepEqual(markers,[{start_move:7,end_move:9,turn:1.5,seat:1}]);
const misleading = {...base,break_markers:[],steps:[step('Alice gains money (triggering break)',20),step('Starting a new break',20)]};
assert.deepEqual(graph(misleading)('money').breaks,[]);
const legacy = {...misleading};delete legacy.break_markers;
assert.deepEqual(graph(legacy)('money').breaks,[{turn:1.5,seat:0}]);

// Paired-axis balances: income after seat 0's nth turn can enter column n
// through seat 1's endpoint. Income after both nth turns first enters n+1.
const betweenPlayers = {...base,normal_turns:[sample(1,20,0),sample(1,35,1),sample(2,30,0)],break_markers:markers};
assert.deepEqual(graph(betweenPlayers)('money').scores,[[25,25],[35,35],[30,30]]);
const afterPair = {...base,normal_turns:[sample(1,20,0),sample(1,20,1),sample(2,40,0),sample(2,35,1)],break_markers:markers};
assert.deepEqual(graph(afterPair)('money').scores,[[25,25],[20,20],[35,35]]);
const finalBreak = {...base,normal_turns:[sample(1,20)],steps:[step('Final scoring',50,'over')],break_markers:markers};
assert.deepEqual(graph(finalBreak)('money').scores,[[25,25],[20,20],[50,50]]);
assert.equal(graph(finalBreak)('money').end,true);
for (const key of ['score','appeal','conservation','reputation','money','x_tokens']) {
 const before=graph(base)(key),after=graph({...base,break_markers:markers})(key);
 assert.deepEqual(after.turns,before.turns);
 assert.deepEqual(after.scores,before.scores);
}

const notification = (type,args=[],uid='same') => ({type,args,uid,log:''});
const packet = (move_id,data,channel='/table/t1') => ({move_id,data,channel,packet_id:String(move_id)});
const raw = {data:{players:[{id:11},{id:22}],logs:[
 packet(1,[notification('startBreak')]),
 packet(3,[notification('finishBreak')]),
 packet(4,[notification('startBreak')]),
 packet('03',[notification('finishBreak',[],'new-uid-for-old-completion')]),
 packet(5,[notification('getBonuses',{player_id:11,bonuses:{money:10},source:'break income'})]),
 packet(6,[notification('finishBreak')]),
 packet(1,[notification('startBreak')]),
 packet(7,[notification('getBonuses',{player_id:11,bonuses:{money:4},source:'ordinary action'})]),
]}};
const result=stats(raw);
assert.equal(result.players[0].money,14);
assert.equal(result.players[0].income,10);
console.log('Structured markers, legacy fallback, duplicate income-phase guards and all six graph sampling categories passed.');

// Break effects: copies are identified by provenance, never by public values.
const advance = (n=2, position=2, uid='advance', pid=11) => notification('advanceBreak',{player_id:pid,n,break:position,maxBreak:9},uid);
const triggerReward = (uid='reward') => notification('getBonuses',{player_id:11,source:'triggering break',bonuses:{xtoken:1}},uid);
const input = (...logs) => ({data:{players:[{id:11},{id:22}],logs}});
const withoutUid = (event) => { const copy=structuredClone(event); delete copy.uid; return copy; };
let effectCases=0;
const checkEffects = (name,logs,advances,breaks=0,xGained=0) => {
 const p=stats(input(...logs)).players[0];
 assert.deepEqual([p.advances,p.breaks,p.xGained],[advances,breaks,xGained],name);
 effectCases++;
};
checkEffects('duplicate in one packet',[packet(1,[advance(),advance()])],2);
checkEffects('same UID in different packets',[packet(1,[advance()]),{...packet(1,[advance()]),packet_id:'resend'}],2);
checkEffects('late copy and numeric move alias',[packet(3,[advance()]),packet(4,[]),packet('03',[advance()])],2);
checkEffects('UID reused on later move is distinct',[packet(1,[advance()]),packet(2,[advance(2,4)])],4);
checkEffects('equal capped effects with distinct UIDs',[packet(1,[advance(5,9,'a'),advance(5,9,'b')])],10);
checkEffects('same move and UID in distinct public channels',[packet(1,[advance()]),packet(1,[advance()],'/table/t2')],4);
checkEffects('public/private twins',[packet(1,[advance()],'/player/p11'),packet(1,[advance()])],2);
checkEffects('duplicate trigger reward',[packet(1,[triggerReward(),triggerReward()])],0,1,1);
checkEffects('reward UID reused after later Break',[packet(1,[triggerReward()]),packet(3,[triggerReward()])],0,2,2);
checkEffects('event type scopes a reused UID',[packet(1,[advance(9,9,'shared'),triggerReward('shared'),advance(9,9,'shared'),triggerReward('shared')])],9,1,1);
checkEffects('numeric zero UID is valid',[packet(1,[advance(2,2,0),advance(2,2,'0')])],2);
const noUidAdvance=withoutUid(advance());
checkEffects('no UID, repeated packet and offset',[packet(1,[noUidAdvance]),structuredClone(packet(1,[noUidAdvance]))],2);
checkEffects('no UID, distinct offsets in same packet',[packet(1,[noUidAdvance,structuredClone(noUidAdvance)])],4);
checkEffects('no UID, distinct packet identities',[packet(1,[noUidAdvance]),{...packet(1,[noUidAdvance]),packet_id:'different'}],4);
const noUidReward=withoutUid(triggerReward());
checkEffects('no UID, repeated triggering reward packet',[packet(1,[noUidReward]),structuredClone(packet(1,[noUidReward]))],0,1,1);
const unidentified=packet(1,[noUidAdvance]);delete unidentified.packet_id;
checkEffects('no usable identity retains both executions',[unidentified,structuredClone(unidentified)],4);
const ordinary=notification('getBonuses',{player_id:11,source:'other action',bonuses:{xtoken:1}},'ordinary');
checkEffects('unrelated rewards retain existing behavior',[packet(1,[ordinary,ordinary])],0,0,2);
checkEffects('Hypnosis actor survives opponent card ownership and cleanup',[
 packet(1,[notification('chooseActionCard',{player_id:11,action_card_type:'Cards',actionCard:{pId:'22'}},'choice'),advance()]),
 packet(2,[notification('actionCardCleanup',{player_id:22},'cleanup')])
],2);
checkEffects('already capped execution is retained without extra trigger',[
 packet(1,[advance(5,9,'first'),triggerReward()]),packet(2,[advance(5,9,'second')])
],10,1,1);
console.log(`${effectCases} Break-effect identity and scope cases passed.`);

// Frozen sums of n and true-trigger counts from 02_break_history_review_spec.md,
// Appendix 20 (independent CSV); not generated from countStats.
const expectedBreakStats = {
 "714192218": {"95544494":[11,2],"95179890":[39,3]},
 "770429314": {"91658657":[24,1],"84076011":[18,3]},
 "791369985": {"95812007":[21,2],"96137892":[30,3]},
 "795215166": {"98051582":[23,3],"98151226":[25,2]},
 "798345117": {"92166550":[23,1],"97053244":[32,4]},
 "800966139": {"84557914":[22,1],"95556688":[25,4]},
 "800999064": {"91932005":[27,3],"94705731":[12,1]},
 "833146203": {"94936862":[21,3],"88982662":[17,1]},
 "853899676": {"88982662":[25,2],"94936862":[23,3]},
 "902906029": {"99346607":[25,1],"94936862":[33,4]},
 "920295323": {"94936862":[22,2],"98175359":[25,3]},
 "920319154": {"96926419":[35,5],"86346298":[21,1]},
 "927683584": {"99346607":[22,2],"86346298":[17,2]},
 "927726814": {"93599262":[6,0],"86346298":[33,4]},
 "927743770": {"98142396":[24,2],"86346298":[23,3]},
 "930258897": {"94401618":[18,1],"86346298":[43,5]},
 "930781276": {"86346298":[22,2],"97616549":[20,2]},
 "931947993": {"99206606":[22,3],"99885563":[32,3]},
 "937181556": {"98793632":[46,5],"83927465":[15,1]},
};
let fixtureGames=0, fixturePlayers=0, advancementTotal=0, triggerTotal=0;
for (const [game,expectedPlayers] of Object.entries(expectedBreakStats)) {
 const filename=path.join(root,'log_examples',game+'.json');
 if (!fs.existsSync(filename)) { console.log('Missing optional raw fixture: '+game); continue; }
 const fixture=JSON.parse(fs.readFileSync(filename,'utf8')), actual=stats(fixture);
 for (const [id,expected] of Object.entries(expectedPlayers)) {
  const seat=fixture.data.players.findIndex(p=>String(p.id)===id);
  assert.notEqual(seat,-1,game+' player '+id);
  const p=actual.players[seat];
  assert.deepEqual([p.advances,p.breaks],expected,game+' player '+id);
  advancementTotal+=p.advances;triggerTotal+=p.breaks;fixturePlayers++;
 }
 fixtureGames++;
 if (game==='902906029') {
  // Duplicate only the affected notifications, preserving all other raw data.
  const original=stats(fixture), changed=structuredClone(fixture);
  for (const pk of changed.data.logs) {
   if (!pk.channel.startsWith('/table/')) continue;
   pk.data=pk.data.flatMap(e => (Number(pk.move_id)===234 && e.type==='advanceBreak') ||
     (Number(pk.move_id)===230 && e.type==='getBonuses' && e.args.source==='triggering break')
     ? [e,structuredClone(e)] : [e]);
  }
  assert.deepEqual(stats(changed),original,'Real Sponsors resend must preserve every statistic, including X-tokens');
 }
}
if (fixtureGames===19) {
 assert.equal(fixturePlayers,38);assert.equal(advancementTotal,922);assert.equal(triggerTotal,93);
}
console.log(`${fixtureGames} raw games / ${fixturePlayers} player totals passed (${advancementTotal} advancement points, ${triggerTotal} triggers).`);
