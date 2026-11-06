import test from 'node:test';
import assert from 'node:assert/strict';
import { actionChanges } from '../web/js/action-motion-plan.js';
const state = () => ({players:[{action_cards:['animals','cards','association','build','sponsors'].map(type=>({type,level:1,variant:0,tokens:[]}))}]});
test('move to slot 1 includes every shifted identity, not the fixed slots',()=>{
  const a=state(),b=structuredClone(a),list=b.players[0].action_cards;list.unshift(list.splice(3,1)[0]);
  assert.deepEqual(actionChanges(a,b).map(c=>[c.type,c.from,c.to]),[['build',3,0],['animals',0,1],['cards',1,2],['association',2,3]]);
});
test('boost to 5 and a subsequent chained return use the current order',()=>{
  const a=state(),b=structuredClone(a),list=b.players[0].action_cards;list.push(list.splice(1,1)[0]);
  assert.deepEqual(actionChanges(a,b).find(c=>c.type==='cards').to,4);
  const c=structuredClone(b);c.players[0].action_cards.unshift(c.players[0].action_cards.pop());
  assert.equal(actionChanges(b,c).find(c=>c.type==='cards').from,4);
});
test('upgrade keeps variant identity and does not invent a reorder',()=>{
  const a=state(),b=structuredClone(a);a.players[0].action_cards[1].variant=4;b.players[0].action_cards[1].variant=4;b.players[0].action_cards[1].level=2;
  const [c]=actionChanges(a,b);assert.equal(c.type,'cards');assert.equal(c.upgraded,true);assert.equal(c.from,c.to);
  assert.deepEqual(c.added,[]);assert.deepEqual(c.removed,[]);
});
test('token differences preserve duplicate multipliers and their original indices',()=>{
  const a=state(),b=structuredClone(a);a.players[0].action_cards[0].tokens=['Multiplier','Venom','Multiplier'];b.players[0].action_cards[0].tokens=['Multiplier','Multiplier','Constriction'];
  const [c]=actionChanges(a,b);assert.deepEqual(c.added,[{type:'Constriction',index:2}]);assert.deepEqual(c.removed,[{type:'Venom',index:1}]);assert.deepEqual(c.kept,[{type:'Multiplier',from:0,to:0},{type:'Multiplier',from:2,to:1}]);
});
test('unchanged, hidden and newly assigned cards do not create action effects',()=>{
  const a=state(),b=state();assert.deepEqual(actionChanges(a,b),[]);
  b.players[0].action_cards.reverse();a.actions_hidden=true;assert.deepEqual(actionChanges(a,b),[]);
  a.players[0].action_cards=[];a.actions_hidden=false;assert.deepEqual(actionChanges(a,b),[]);
});
test('both players and simultaneous movement, upgrade and token gain are retained',()=>{
  const a=state();a.players.push(structuredClone(a.players[0]));const b=structuredClone(a);
  const c=b.players[0].action_cards.pop();c.level=2;c.tokens=['Venom'];b.players[0].action_cards.unshift(c);b.players[1].action_cards[2].tokens=['Constriction'];
  const changes=actionChanges(a,b),p=changes.find(x=>x.type==='sponsors');assert.equal(p.upgraded,true);assert.equal(p.to,0);assert.equal(p.added[0].type,'Venom');assert.equal(changes.find(x=>x.seat===1).type,'association');
});
