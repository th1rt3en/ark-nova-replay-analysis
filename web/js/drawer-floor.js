// Approved Library wine wool floor. A deterministic high-resolution swatch is
// cached once; lighting and the cabinet's contact shadow are baked into its background.
let wool = null;
export function paintDrawerFloor(g, { canvas, rng, noise2, W, H, DR, afterFloor, K }) {
 const S = Math.max(1, Math.ceil(K || 1));                      // swatch pixels per unit (the wool is baked at the screen's density: 1 or 2)
 if (!wool || wool.S !== S) {
  const A=320,c=canvas(A*S,A*S),q=c.getContext('2d'),r=rng(916),im=q.createImageData(c.width,c.height),d=im.data;
  // Soft blotches from a value noise whose lattice wraps round (P x P cells over the swatch), and every stroke is drawn again at the opposite edge where it crosses
  // one: the swatch tiles without a seam (the earlier noise did not wrap, so every 320 units a faint line and an identical block showed).
  const P=51,lat=new Float32Array(P*P);for(let i=0;i<lat.length;i++)lat[i]=r();
  const sm=t=>t*t*(3-2*t),val=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),u=sm(x-xi),v=sm(y-yi),X=((xi%P)+P)%P,Y=((yi%P)+P)%P,X1=(X+1)%P,Y1=(Y+1)%P,a=lat[Y*P+X],b=lat[Y*P+X1],c2=lat[Y1*P+X],e=lat[Y1*P+X1];return a+(b-a)*u+(c2-a)*v+(a-b-c2+e)*u*v;};
  // Deep wine wool echoes the hall's burgundy rug under warm ambient light.
  const base=[92,24,37];
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
   const i=(y*c.width+x)*4,k=1+(val(x/c.width*P,y/c.height*P)-.5)*.23+(r()-.5)*.2;
   for(let z=0;z<3;z++)d[i+z]=base[z]*k;d[i+3]=255;
  }
  q.putImageData(im,0,0);q.scale(S,S);
  for(let i=0;i<A*A/6;i++){
   const x=r()*A,y=r()*A,a=r()*6.28,len=.6+r()*1.8,dx=Math.cos(a)*len,dy=Math.sin(a)*len;
   q.strokeStyle=i%3===0?'rgba(13,4,5,.35)':'rgba(192,92,111,.27)';q.lineWidth=.3+r()*.4;
   for(const ox of [0,A,-A])for(const oy of [0,A,-A]){
    if(x+ox<-4||x+ox>A+4||y+oy<-4||y+oy>A+4)continue;
    const X=x+ox,Y=y+oy;q.beginPath();q.moveTo(X,Y);q.quadraticCurveTo(X+dx*.5+dy*.3,Y+dy*.5-dx*.3,X+dx,Y+dy);q.stroke();
   }
  }
  wool=c;wool.S=S;
 }
 const p=g.createPattern(wool,'repeat');p.setTransform(new DOMMatrix().scale(1/S));
 g.fillStyle=p;g.fillRect(0,0,W,H);
 const light=g.createRadialGradient(W*.45,H*.45,80,W*.5,H*.5,W*.83);
 light.addColorStop(0,'rgba(171,93,44,.08)');light.addColorStop(1,'rgba(0,0,0,.3)');g.fillStyle=light;g.fillRect(0,0,W,H);
 if (afterFloor) afterFloor(g.canvas);           // (the plain floor, before the drawer's dark footprint: this is what shows where the drawer is not)
 g.save();g.shadowColor='rgba(0,0,0,.76)';g.shadowBlur=20*(K||1);g.shadowOffsetY=8*(K||1);g.fillStyle='#160b07';g.fillRect(DR.x+3,DR.y+12,DR.w-6,DR.h-10);g.restore();
}
