/* ================= CORE ================= */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hashStr(s){let h=1779033703^s.length;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19}return h>>>0}
function hash2(x,y,s){let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(s|0,974634563))|0;h=Math.imul(h^(h>>>13),1274126177);h=(h^(h>>>16))>>>0;return h/4294967296}
function lerp(a,b,t){return a+(b-a)*t}
function clamp(v,a,b){return v<a?a:(v>b?b:v)}
function vnoise(x,y,s){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  return lerp(lerp(hash2(ix,iy,s),hash2(ix+1,iy,s),sx),lerp(hash2(ix,iy+1,s),hash2(ix+1,iy+1,s),sx),sy)}
function fbm(x,y,s,oct){let v=0,a=0.5,f=1,sum=0;for(let i=0;i<oct;i++){v+=a*vnoise(x*f,y*f,s+i*57);sum+=a;a*=0.5;f*=2}return v/sum}
function cheb(ax,ay,bx,by){return hexDist2(ax|0,ay|0,bx|0,by|0)} // hex-метрика; имя сохранено ради call sites
function heightOf(t){return t===T.MTN?2:(t===T.ROCK?1:0)}
function terrainSpeed(u,cx,cy){
  const t=S.terr[idx(cx,cy)];
  if(t===T.ROCK)return (u.race==='dwarf'||u.race==='troll')?1:0.7;
  if(t===T.FOREST)return (u.race==='elf')?1:0.75;
  if(t===T.SCRUB)return (u.race==='elf')?1:0.85;
  if(t===T.SWAMP)return (u.race==='troll')?1:0.6;
  return 1;
}

