/* ================= SPRITES (palette + grids) ================= */
const PAL={
  o:'#141018',
  W1:'#1d4f6e',W2:'#2a6f92',W3:'#4899b0',
  G1:'#38652f',G2:'#4c8a3f',G3:'#69a84e',
  F1:'#1f4526',F2:'#2d6134',F3:'#417d3d',
  R1:'#565460',R2:'#73717c',R3:'#8f8d97',
  M1:'#4b4652',M2:'#6b6573',SN:'#dadde6',
  DI:'#6d5238',w:'#8a6b45',Wd:'#6b4f30',
  r:'#a5533a',R:'#7c3b2a',y:'#eec658',k:'#100c14',
  SK:'#d9a066',Cb:'#3a5aa8',Cg:'#3f7d5a',Cr:'#a8353a',
  TR:'#7c8a6a',GEM:'#59d6d0',BER:'#c8384a',NEC:'#7a4fae',D:'#3a2a1c'
};
const OUTL={};OUTL[T.GRASS]=PAL.G1;OUTL[T.FOREST]=PAL.F1;OUTL[T.ROCK]=PAL.R1;OUTL[T.MTN]=PAL.o;

const G_HUMAN=[
"................",
"................",
"......hhhh......",
".....hhhhhh.....",
".....hssssh.....",
".....ssssss.....",
"......ssss......",
".....cccccc.....",
"....sccccccs....",
"....sccccccs....",
"......dddd......",
"......c..c......",
"......c..c......",
"......b..b......",
"................",
"................"];
const G_DWARF=[
"................",
"................",
"................",
"................",
"................",
"......qqqq......",
".....qqqqqq.....",
".....ssssss.....",
"....HssssssH....",
"....HHHHHHHH....",
"....HccccccH....",
"...sccccccccs...",
"......dddd......",
"......c..c......",
"......b..b......",
"................"];
const G_ELF=[
"................",
".......cc.......",
"......cccc......",
"......ssss......",
"......ssss......",
".......cc.......",
"......cccc......",
"......cccc......",
"......cccc......",
".......dd.......",
"......c..c......",
"......c..c......",
"......b..b......",
"................",
"................",
"................"];
const G_TROLL=[
"................",
"................",
"................",
".....gggggg.....",
"....gggggggg....",
"....geggggeg....",
"....gggggggg....",
"...ggddddddgg...",
"...gggddddggg...",
"....gg....gg....",
"....gg....gg....",
"....bb....bb....",
"................",
"................",
"................",
"................"];
const G_HUT=[
"................",
"................",
"................",
"..oooooooooooo..",
"..orrrrrrrrrro..",
"..orrrrrrrrrro..",
"..oRRRRRRRRRRo..",
"..owwwwwwwwwwo..",
"..owwwwDDwwwwo..",
"..owwwwDDwwwwo..",
"..oWWWWWWWWWWo..",
"..oooooooooooo..",
"................",
"................",
"................",
"................"];
const G_HOUSE2=[ // дом переселенцев (лачуга тир 2, п.10): каменный низ, деревянный верх
"................",
"......oooo......",
"....oorrrroo....",
"...orrrrrrrro...",
"..orrrrrrrrrro..",
"..oRRRRRRRRRRo..",
"..owwwwwwwwwwo..",
"..owgowwwwogwo..",
"..owwwwwwwwwwo..",
"..oWWWWWWWWWWo..",
"..osssssssssso..",
"..osgossssogso..",
"..ossssDDsssso..",
"..ossssDDsssso..",
"..oSSSSSSSSSSo..",
"..oooooooooooo.."];
const HOUSE2_MAP={o:PAL.o,r:PAL.r,R:PAL.R,w:PAL.w,W:PAL.Wd,s:PAL.R2,S:PAL.R1,D:PAL.D,g:PAL.y};
const G_TOWNHALL=[
"........y.......",
"........yy......",
"........p.......",
"......oooo......",
".....orrrro.....",
"....orrrrrro....",
"...orrrrrrrro...",
"..orrrrrrrrrro..",
".orrrrrrrrrrrro.",
".oRRRRRRRRRRRRo.",
".osssssssssssso.",
".osssssssssssso.",
".osgsssDDsssgso.",
".osgsssDDsssgso.",
".osssssDDssssso.",
".oSSSSSSSSSSSSo.",
".oooooooooooooo."];
const G_TOWER=[
"....s.ss.s......",
"....ssssss......",
"....ssssss......",
"....sskkss......",
"....ssssss......",
"....ssssss......",
"....sskkss......",
"....ssssss......",
"...ssssssss.....",
"...sSSSSSSs.....",
"...ssssssss.....",
"..ssssssssss...."];
const G_NECRO=[
".......v........",
"......vvv.......",
".......n........",
"......nnn.......",
"......nnn.......",
".....nnnnn......",
".....nknkn......",
".....nnnnn......",
".....nnnnn......",
".....nknkn......",
".....nnnnn......",
"....nnnnnnn.....",
"....nNNNNNn.....",
"....nnnnnnn.....",
"...nnnnnnnnn...."];

const G_TAVERN=[
"................",
"................",
"................",
"................",
"....oooooooo....",
"...orrrrrrrro...",
"..orrrrrrrrrro..",
".orrrrrrrrrrrro.",
".oRRRRRRRRRRRRo.",
".owwwwwwwwwwwwo.",
".owgowwwwwwogwo.",
".owgowwDDwwogwo.",
".owwwwwDDwwwwwo.",
".oWWWWWWWWWWWWo.",
".oooooooooooooo.",
"................"];
const TAVERN_MAP={o:PAL.o,r:PAL.Cg,R:PAL.F1,w:PAL.w,W:PAL.Wd,D:PAL.D,g:PAL.y};
const G_RAIDER=[
"................",
"................",
"......kkkk......",
".....kkkkkk.....",
".....kekkek.....",
".....kkkkkk.....",
"....kkkkkkkk....",
"...kkkddddkk....",
"...w.kkkkkk.....",
"...w..kkkk......",
"...w..k..k......",
"...w..k..k......",
"......b..b......",
"................",
"................",
"................"];
const RAIDER_MAP={k:PAL.o,e:PAL.BER,d:PAL.Cr,b:PAL.D,w:PAL.Wd};
const UNIT_MAPS={
  human:{h:PAL.Wd,s:PAL.SK,c:PAL.Cb,d:PAL.D,b:PAL.D},
  dwarf:{q:PAL.R,s:PAL.SK,H:PAL.r,c:PAL.Cr,d:PAL.D,b:PAL.D},
  elf:{c:PAL.Cg,s:PAL.SK,d:PAL.D,b:PAL.D},
  troll:{g:PAL.TR,e:PAL.o,d:PAL.DI,b:PAL.D}
};
const UNIT_GRIDS={human:G_HUMAN,dwarf:G_DWARF,elf:G_ELF,troll:G_TROLL};
const HUT_MAPS={
  hut:{o:PAL.o,r:PAL.r,R:PAL.R,w:PAL.w,W:PAL.Wd,D:PAL.D},
  fisher:{o:PAL.o,r:PAL.Cb,R:PAL.W1,w:PAL.w,W:PAL.Wd,D:PAL.D},
  lumber:{o:PAL.o,r:PAL.Wd,R:PAL.D,w:PAL.w,W:PAL.Wd,D:PAL.D},
  tavern:{o:PAL.o,r:PAL.Cg,R:PAL.F1,w:PAL.w,W:PAL.Wd,D:PAL.D}
};
const TH_MAP={y:PAL.y,p:PAL.Wd,o:PAL.o,r:PAL.r,R:PAL.R,s:PAL.R2,S:PAL.R1,g:PAL.y,D:PAL.k};
const TOWER_MAP={s:PAL.R2,S:PAL.R1,k:PAL.k};
const NECRO_MAP={n:PAL.M1,N:PAL.o,k:PAL.NEC,v:PAL.NEC};

function validateSprites(){
  const all={G_HUMAN,G_DWARF,G_ELF,G_TROLL,G_HUT,G_HOUSE2,G_TOWNHALL,G_TOWER,G_NECRO};
  const errs=[];
  for(const n in all){
    const g=all[n];
    g.forEach((row,i)=>{if(row.length!==16)errs.push(n+' row '+i+' len '+row.length)});
  }
  return errs;
}
function bobFrame(rows){
  const blank='.'.repeat(16);
  return [blank].concat(rows.slice(0,rows.length-1));
}
function terrPix(t,x,y,seed){
  const h=hash2(x,y,seed);
  switch(t){
    case T.WATER: if(h<0.05)return PAL.W3; if(h>0.93)return PAL.W1; return PAL.W2;
    case T.GRASS: if(h<0.08)return PAL.G3; if(h>0.92)return PAL.G1; return PAL.G2;
    case T.FOREST:{const b=hash2(x>>1,y>>1,seed+3);if(b<0.28)return PAL.F1;if(b>0.74&&h<0.5)return PAL.F3;return PAL.F2}
    case T.ROCK: if(h<0.10)return PAL.R1; if(h>0.90)return PAL.R3; return PAL.R2;
    case T.MTN:{const d=(x+y)&7;let c=(d<3)?PAL.M2:PAL.M1;
      if(y<5&&hash2(x,y,seed+7)<0.55)c=PAL.SN;
      if(h<0.07)c=PAL.M1;return c}
  }
  return '#f0f';
}

