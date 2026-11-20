// Astronomer's Archive with approved Dented Archive finish. Baked once at startup;
// tile materials, collision dimensions and per-frame physics are independent.
export function paintDrawerCabinet(g, cab, { canvas, noise2, rng, mix, DR, IN, LABEL, W, H, K = 1 }) {
 const PALETTE={dark:[62,26,21],mid:[110,48,36],light:[154,80,56],edge:'#9a5038',gold:'#a58b57'};
function furnitureWood(w,h,vert,seed) {
 const p=PALETTE,c=canvas(Math.round(w*K),Math.round(h*K)),g=c.getContext('2d'),im=g.createImageData(c.width,c.height),d=im.data,n=noise2(seed),m=noise2(seed+93);   // (baked at the screen's density K, the grain is the same in units)
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
  const a=(vert?y:x)/K,b=(vert?x:y)/K;
  const bend=n(a*.002,b*.012)*16 + n(a*.0007,b*.002)*25;
  const broad=n(a*.0018,(b+bend)*.036),ribbon=Math.sin((b+bend)*.32+n(a*.004,b*.009)*5);
  let t=.43+broad*.34+ribbon*.047+m(a*.08,b*.5)*.035;
  // fine, long open pores under a rubbed finish
  const pore=m(a*.025,b*1.4);if(pore>.77)t-=(pore-.77)*.25;
  t=Math.max(0,Math.min(1,t));const z=t<.5?p.dark:p.mid,z2=t<.5?p.mid:p.light,k=t<.5?t*2:(t-.5)*2,i=(y*c.width+x)*4;
  for(let q=0;q<3;q++)d[i+q]=mix(z[q],z2[q],k);d[i+3]=255;
 }
 g.putImageData(im,0,0);
 // Long, wandering fibres and finer pores, below the satin wax rather than a glossy overlay.
 g.save();g.scale(K,K);if(vert){g.translate(w,0);g.rotate(Math.PI/2);}const length=vert?h:w,depth=vert?w:h,rand=rng(seed+218);
 for(let j=-4;j<depth+4;j+=1.6+rand()*2.8){
  const amp=1+rand()*3,phase=rand()*6.28;g.beginPath();
  for(let a=0;a<=length+8;a+=8){const b=j+Math.sin(a*.004+phase)*amp+Math.sin(a*.011+phase)*amp*.23;if(a===0)g.moveTo(a,b);else g.lineTo(a,b);}
  g.strokeStyle=`rgba(18,8,3,${.03+rand()*.09})`;g.lineWidth=.35+rand()*.45;g.stroke();
 }
 for(let j=0;j<length*depth/260;j++){const a=rand()*length,b=rand()*depth;g.strokeStyle='rgba(20,9,4,.13)';g.lineWidth=.45;g.beginPath();g.moveTo(a,b);g.lineTo(a+2+rand()*13,b+.1);g.stroke();}
 g.restore();return c;
}
function furnitureRail(g,x,y,w,h,vertical=false,seed=45){
 const p=PALETTE;g.drawImage(furnitureWood(w,h,vertical,seed),x,y,w,h);
 const grad=vertical?g.createLinearGradient(x,0,x+w,0):g.createLinearGradient(0,y,0,y+h);
 for(const [s,col] of [[0,'#170d09'],[.025,p.edge],[.065,'rgba(220,182,119,.28)'],[.13,'rgba(0,0,0,.28)'],[.19,'rgba(0,0,0,0)'],[.76,'rgba(0,0,0,0)'],[.86,'rgba(0,0,0,.32)'],[.92,'rgba(240,192,126,.17)'],[1,'rgba(9,4,3,.8)']])grad.addColorStop(s,col);
 g.fillStyle=grad;g.fillRect(x,y,w,h);
 g.strokeStyle='rgba(14,7,4,.8)';g.lineWidth=1;g.strokeRect(x+.5,y+.5,w-1,h-1);
 // interrupted, hairline wear; deliberately sparse and confined to the edges
 const r=rng(seed+8);g.strokeStyle='rgba(230,190,126,.16)';g.lineWidth=.65;
 for(let i=0;i<Math.ceil((vertical?h:w)/40);i++){const a=r()*(vertical?h:w),l=2+r()*11;g.beginPath();if(vertical){g.moveTo(x+3,y+a);g.lineTo(x+3,y+a+l);}else{g.moveTo(x+a,y+3);g.lineTo(x+a+l,y+3);}g.stroke();}
}
function furnitureLine(g,x,y,w,h,inset,color){g.strokeStyle=color;g.lineWidth=.75;g.strokeRect(x+inset,y+inset,w-2*inset,h-2*inset);}
function furnitureRivet(g,x,y){const r=g.createRadialGradient(x-1,y-1,0,x,y,3);r.addColorStop(0,'#c7ad73');r.addColorStop(.55,'#89703f');r.addColorStop(1,'#372315');g.fillStyle=r;g.beginPath();g.arc(x,y,2.5,0,7);g.fill();g.strokeStyle='#4c3924';g.lineWidth=.6;g.beginPath();g.moveTo(x-1,y+.7);g.lineTo(x+1,y-.7);g.stroke();}
function mPath(g,draw,color='#aa8e59',width=.8){g.beginPath();draw(g);g.strokeStyle=color;g.lineWidth=width;g.stroke();}
function mStar(g,x,y,r){mPath(g,q=>{for(let i=0;i<16;i++){const a=i*Math.PI/8-Math.PI/2,k=i%2?r*.24:(i%4?r*.5:r);const xx=x+Math.cos(a)*k,yy=y+Math.sin(a)*k;i?q.lineTo(xx,yy):q.moveTo(xx,yy);}q.closePath();},'#ac915d',.85);}
function ornamentMahogany(g,cab){
 const fy=DR.y+DR.h-DR.tf;
 furnitureLine(g,DR.x,DR.y,DR.w,DR.h,7,'rgba(180,146,86,.5)');
 furnitureLine(cab,DR.x+5,8,DR.w-10,30,0,'rgba(180,146,86,.3)');

  for(const [q,x,y,r]of [[g,224,fy+37,17],[g,1176,fy+37,17],[cab,700,25,11]]){q.beginPath();q.arc(x,y,r,0,Math.PI*2);q.strokeStyle='rgba(171,138,83,.5)';q.lineWidth=.7;q.stroke();mStar(q,x,y,r*.78);}
  for(const x of [390,1010]){cab.beginPath();cab.arc(x,25,5,0,Math.PI*2);cab.strokeStyle='rgba(171,138,83,.5)';cab.stroke();cab.beginPath();cab.arc(x+2,24,4,0,Math.PI*2);cab.stroke();}
  for(const x of [176,272,1128,1224]){g.fillStyle='#967643';g.beginPath();g.arc(x,fy+37,1.5,0,7);g.fill();}
  for(const x of [DR.x+17,DR.x+DR.w-17])for(const y of [DR.y+19,fy-18])mStar(g,x,y,6);

}
function decorateFurniture(g,cab){
 const fy=DR.y+DR.h-DR.tf;
 // Full cabinet crown, including the top timber from which the drawer emerges.
 furnitureRail(cab,0,0,W,74,false,11);cab.fillStyle='rgba(0,0,0,.63)';cab.fillRect(DR.x-14,DR.y,DR.w+28,28);
 furnitureLine(cab,107,6,1186,35,4,'rgba(12,6,4,.65)');
 cab.strokeStyle='rgba(210,164,95,.22)';cab.beginPath();cab.moveTo(112,12);cab.lineTo(1288,12);cab.stroke();
 furnitureRail(g,DR.x,DR.y,DR.w,DR.t,false,51);
 furnitureRail(g,DR.x,DR.y+DR.t,DR.t,IN.h,true,52);
 furnitureRail(g,DR.x+DR.w-DR.t,DR.y+DR.t,DR.t,IN.h,true,53);
 furnitureRail(g,DR.x,fy,DR.w,DR.tf,false,54);
 ornamentMahogany(g,cab);
 // A slim, tarnished label surround with a softened, aged paper insert.
 const {x:bx,y:by,w:bw,h:bh}=LABEL,br=g.createLinearGradient(0,by,0,by+bh);
 br.addColorStop(0,'#bca36a');br.addColorStop(.12,'#8c713f');br.addColorStop(.48,'#9e8149');br.addColorStop(1,'#49371b');
 g.save();g.shadowColor='rgba(0,0,0,.65)';g.shadowBlur=5*K;g.shadowOffsetY=2*K;g.fillStyle=br;g.beginPath();g.roundRect(bx,by,bw,bh,3);g.fill();g.restore();
 g.strokeStyle='#372514';g.lineWidth=1.5;g.stroke();g.fillStyle='#ddcba7';g.fillRect(bx+9,by+5,bw-18,bh-10);
 const paper=g.createLinearGradient(0,by,0,by+bh);paper.addColorStop(0,'rgba(84,58,26,.2)');paper.addColorStop(.35,'rgba(255,235,192,.04)');paper.addColorStop(1,'rgba(84,58,26,.08)');g.fillStyle=paper;g.fillRect(bx+9,by+5,bw-18,bh-10);
 for(const x of [bx+4.5,bx+bw-4.5])furnitureRivet(g,x,by+bh/2);
 // Same graspable handle silhouette, with concentric turned brass and patina.
 const kx=W/2,ky=DR.y+DR.h+14;g.fillStyle='#33200c';g.beginPath();g.ellipse(kx,ky+1,32,20,0,0,7);g.fill();
 const metal=g.createRadialGradient(kx-8,ky-7,1,kx,ky,33);metal.addColorStop(0,'#d9bd7c');metal.addColorStop(.28,'#b99a55');metal.addColorStop(.65,'#80602c');metal.addColorStop(1,'#3b2812');g.fillStyle=metal;g.beginPath();g.ellipse(kx,ky-1,30,18,0,0,7);g.fill();g.strokeStyle='rgba(226,197,136,.34)';g.lineWidth=.8;g.beginPath();g.ellipse(kx,ky-1,26,14,0,0,7);g.stroke();
 const rr=rng(619);g.strokeStyle='rgba(51,39,19,.2)';g.lineWidth=.5;for(let i=0;i<14;i++){const x=kx+(rr()-.5)*37,y=ky+(rr()-.5)*18;g.beginPath();g.moveTo(x,y);g.lineTo(x+rr()*4,y-rr());g.stroke();}
}
function ageMahogany(g,cab){
 const age=.75,fy=DR.y+DR.h-DR.tf;
 function wear(q,rails,seed){const r=rng(seed);for(const [x,y,w,h]of rails){
  q.save();q.beginPath();q.rect(x,y,w,h);q.clip();
  // Bloom in old wax, subtle translucent unevenness, restricted to timber.
  for(let j=0;j<Math.ceil(w*h/1300);j++){const xx=x+r()*w,yy=y+r()*h,rad=3+r()*12,k=q.createRadialGradient(xx,yy,0,xx,yy,rad);k.addColorStop(0,`rgba(161,124,83,${.016*age})`);k.addColorStop(1,'rgba(161,124,83,0)');q.fillStyle=k;q.fillRect(xx-rad,yy-rad,rad*2,rad*2);}
  // Tiny dents and hairline scratches, never structural cracks or rot.
  for(let j=0;j<w*h/1600*age;j++){const xx=x+3+r()*(w-6),yy=y+3+r()*(h-6),len=1+r()*5;q.strokeStyle=`rgba(11,5,4,${.14*age})`;q.lineWidth=.45+r()*.4;q.beginPath();q.moveTo(xx,yy);q.lineTo(xx+len,yy+(r()-.5)*2);q.stroke();q.strokeStyle=`rgba(173,122,72,${.11*age})`;q.beginPath();q.moveTo(xx,yy+1);q.lineTo(xx+len*.65,yy+1);q.stroke();}
  // Rubbed front edges catch warm light, with gaps in the worn finish.
  for(let j=0;j<w/16*age;j++){const xx=x+r()*w,len=1+r()*7;q.strokeStyle=`rgba(192,145,91,${.19*age})`;q.lineWidth=.7;q.beginPath();q.moveTo(xx,y+2+r()*2);q.lineTo(xx+len,y+2+r()*2);q.stroke();}
  q.restore();}}
 wear(g,[[DR.x,DR.y,DR.w,DR.t],[DR.x,DR.y+DR.t,DR.t,IN.h],[DR.x+DR.w-DR.t,DR.y+DR.t,DR.t,IN.h],[DR.x,fy,DR.w,DR.tf]],522);
 wear(cab,[[0,0,W,74]],996);
 // A few worn patches on the brass holder and low spots dark with age.
 const r=rng(639);for(let j=0;j<20*age;j++){const x=LABEL.x+r()*LABEL.w,y=LABEL.y+(r()>.5?2:LABEL.h-3);g.fillStyle=`rgba(37,36,24,${.13*age})`;g.fillRect(x,y,1+r()*6,1+r()*2);}
 for(const x of [LABEL.x+4.5,LABEL.x+LABEL.w-4.5]){g.strokeStyle=`rgba(45,63,44,${.23*age})`;g.lineWidth=1.5;g.beginPath();g.arc(x,LABEL.y+LABEL.h/2,2.9,.4,2.4);g.stroke();}
}

function libraryPatina(g,cab){
 const p={rub:1.15,scratches:1.2,checking:1,bloom:1.2},fy=DR.y+DR.h-DR.tf;
 function timber(q,x,y,w,h,vertical,seed){
  q.save();q.beginPath();q.rect(x,y,w,h);q.clip();q.translate(x,y);if(vertical){q.translate(w,0);q.rotate(Math.PI/2);[w,h]=[h,w];}
  const r=rng(seed);
  // Soft, rubbed-through wax along handled edges and corners. These are translucent,
  // irregular patches of exposed warm wood, rather than stains or white scratches.
  for(let i=0;i<Math.ceil(w/42);i++){
   const xx=r()*w,yy=r()>.55?3+r()*3:h-3-r()*4,ww=5+r()*27,hh=1+r()*3;
   q.save();q.translate(xx,yy);q.scale(ww,hh);const a=q.createRadialGradient(0,0,0,0,0,1);a.addColorStop(0,`rgba(200,135,83,${.22*p.rub})`);a.addColorStop(1,'rgba(164,98,59,0)');q.fillStyle=a;q.fillRect(-1,-1,2,2);q.restore();
  }
  for(const xx of [9,w-9]){q.save();q.translate(xx,h/2);q.scale(17,h*.46);const a=q.createRadialGradient(0,0,0,0,0,1);a.addColorStop(0,`rgba(178,109,65,${.12*p.rub})`);a.addColorStop(1,'rgba(178,109,65,0)');q.fillStyle=a;q.fillRect(-1,-1,2,2);q.restore();}
  // Old wax loses its perfectly even sheen: broad low-contrast brushy areas.
  for(let i=0;i<w/120;i++){
   const xx=r()*w,yy=8+r()*(h-16),ww=14+r()*52,hh=2+r()*4;
   q.save();q.translate(xx,yy);q.scale(ww,hh);const a=q.createRadialGradient(0,0,0,0,0,1);a.addColorStop(0,`rgba(210,156,113,${.065*p.bloom})`);a.addColorStop(1,'rgba(210,156,113,0)');q.fillStyle=a;q.fillRect(-1,-1,2,2);q.restore();
  }
  // Sparse small knocks in clusters, with a dark recess and a warm lower lip.
  for(let i=0;i<w/65*p.scratches;i++){
   const xx=6+r()*(w-12),yy=7+r()*(h-14),len=2+r()*10,dy=(r()-.5)*3;
   q.beginPath();q.moveTo(xx,yy);q.quadraticCurveTo(xx+len*.3,yy+dy,xx+len,yy+dy*.4);q.strokeStyle='rgba(35,13,8,.38)';q.lineWidth=.6+r()*.6;q.stroke();
   q.beginPath();q.moveTo(xx+1,yy+1);q.lineTo(xx+len*.7,yy+dy*.4+1);q.strokeStyle='rgba(189,115,70,.34)';q.lineWidth=.65;q.stroke();
  }
  // Tiny finish chips interrupt selected edges, without losing the drawer's structure.
  for(let i=0;i<w/95*p.rub;i++){
   const xx=r()*w,yy=r()>.5?1.5:h-2,ww=1+r()*4;
   q.beginPath();q.moveTo(xx,yy);q.lineTo(xx+ww,yy-.4);q.lineTo(xx+ww*.6,yy+(yy<h/2?2:-2));q.closePath();q.fillStyle='rgba(164,98,57,.48)';q.fill();
  }
  // Fine age checking in the old finish.
  if(p.checking){for(let i=0;i<Math.ceil(w/420*p.checking);i++){
   const xx=25+r()*(w-50),yy=8+r()*(h-16),len=9+r()*18;
   q.beginPath();q.moveTo(xx,yy);q.lineTo(xx+len*.34,yy-1);q.lineTo(xx+len*.67,yy+.4);q.lineTo(xx+len,yy-.6);q.strokeStyle='rgba(36,13,8,.38)';q.lineWidth=.5;q.stroke();
  }}
  {
   // A darker, well-used face with occasional substantial old knocks.
   q.fillStyle='rgba(35,14,8,.16)';q.fillRect(0,0,w,h);
   for(let i=0;i<Math.max(1,w/280);i++){
    const xx=10+r()*(w-35),yy=8+r()*(h-16),len=4+r()*10;
    q.beginPath();q.moveTo(xx,yy);q.bezierCurveTo(xx+len*.2,yy-2,xx+len*.65,yy-1,xx+len,yy+.4);q.lineTo(xx+len*.7,yy+2.5);q.lineTo(xx+2,yy+1.7);q.closePath();q.fillStyle='rgba(29,11,6,.48)';q.fill();
    q.beginPath();q.moveTo(xx+2,yy+2.8);q.lineTo(xx+len*.75,yy+3);q.strokeStyle='rgba(192,124,75,.6)';q.lineWidth=1;q.stroke();
   }
   for(let i=0;i<Math.max(1,w/550);i++){const xx=18+r()*(w-70),yy=h*.5; q.beginPath();q.moveTo(xx,yy);q.lineTo(xx+10,yy-1);q.lineTo(xx+24,yy+.8);q.lineTo(xx+39,yy-.5);q.lineTo(xx+51,yy+.3);q.strokeStyle='rgba(26,10,6,.5)';q.lineWidth=.9;q.stroke();}
  }
  q.restore();
 }
 timber(cab,0,0,W,74,false,823);
 timber(g,DR.x,DR.y,DR.w,DR.t,false,448);
 timber(g,DR.x,DR.y+DR.t,DR.t,IN.h,true,64);
 timber(g,DR.x+DR.w-DR.t,DR.y+DR.t,DR.t,IN.h,true,67);
 // Don't scuff the paper label; treat the timber fields independently.
 timber(g,DR.x,fy,LABEL.x-DR.x,DR.tf,false,118);
 timber(g,LABEL.x+LABEL.w,fy,DR.x+DR.w-LABEL.x-LABEL.w,DR.tf,false,120);
 // Worn ornament is interrupted delicately where fingers rub the front edge.
 for(const x of [224,1176]){g.save();g.translate(x,fy+37);g.strokeStyle=`rgba(112,52,36,${.2*p.rub})`;g.lineWidth=1.1;g.beginPath();g.arc(0,0,17,.2,1);g.stroke();g.restore();}
}

 decorateFurniture(g,cab);ageMahogany(g,cab);libraryPatina(g,cab);
 // Approved shadow gap: a recessed cabinet opening separates the two timbers.
 // Paint into the existing baked layers; the opening's dimensions and motion stay fixed.
 const gapX=DR.x-8, gapW=DR.w+16;
 cab.fillStyle='#100705';cab.fillRect(gapX,DR.y-10,gapW,10);
 cab.fillStyle='rgba(193,123,77,.48)';cab.fillRect(gapX,DR.y-11,gapW,1);
 const gapShadow=g.createLinearGradient(0,DR.y,0,DR.y+9);
 gapShadow.addColorStop(0,'rgba(7,3,2,.45)');gapShadow.addColorStop(1,'rgba(7,3,2,0)');
 g.fillStyle=gapShadow;g.fillRect(DR.x,DR.y,DR.w,9);

}
