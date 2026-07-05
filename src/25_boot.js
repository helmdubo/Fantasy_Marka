function forceGridDefaults(){
  const HEX_GRID_COLOR=0xeec658; // hex / Voronoi grid — yellow
  const TRI_GRID_COLOR=0x3a6ac0; // dual triangle grid — blue
  const recolorGrid=()=>{
    if(R&&R.gridMain){
      R.gridMain.material.color.setHex(HEX_GRID_COLOR);
      R.gridMain.material.opacity=0.68;
      R.gridMain.visible=!!(S&&S.showGrid);
    }
    if(R&&R.gridDual){
      R.gridDual.material.color.setHex(TRI_GRID_COLOR);
      R.gridDual.material.opacity=0.58;
      R.gridDual.visible=!!(S&&S.showGrid);
    }
  };
  if(typeof buildGridOverlay==='function'){
    const baseBuildGridOverlay=buildGridOverlay;
    buildGridOverlay=function(){
      const result=baseBuildGridOverlay.apply(this,arguments);
      recolorGrid();
      return result;
    };
  }
  if(typeof newGame==='function'){
    const baseNewGame=newGame;
    newGame=function(){
      const result=baseNewGame.apply(this,arguments);
      if(S)S.showGrid=true;
      if(result)result.showGrid=true;
      return result;
    };
  }
  if(typeof initRender==='function'){
    const baseInitRender=initRender;
    initRender=function(){
      const result=baseInitRender.apply(this,arguments);
      if(S)S.showGrid=true;
      if(R){
        if(!R.gridDual||!R.gridMain)buildGridOverlay();
        else recolorGrid();
        if(R.gridDual)R.gridDual.visible=true;
        if(R.gridMain)R.gridMain.visible=true;
      }
      return result;
    };
  }
  if(typeof restart==='function'){
    const baseRestart=restart;
    restart=function(){
      const result=baseRestart.apply(this,arguments);
      if(S)S.showGrid=true;
      if(R){
        if(!R.gridDual||!R.gridMain)buildGridOverlay();
        else recolorGrid();
        if(R.gridDual)R.gridDual.visible=true;
        if(R.gridMain)R.gridMain.visible=true;
      }
      return result;
    };
  }
}

if(IS_BROWSER){
  forceGridDefaults();
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',boot);
  else boot();
}else{
  runHeadless();
}
//</GAME>