/* ================= MAIN ================= */
function restart(seedStr){
  clearFeedbackLayer();
  newGame(seedStr);
  buildAtlas();
  R.tex.image=ATLAS.cv;R.tex.needsUpdate=true;
  R.cam.x=WXC(S.th.x);R.cam.y=WYCC(S.th.x,S.th.y);
  buildTerrain();buildRoads();buildStatics();buildBuildings();paintFog();
  if(R.gridDual){R.scene.remove(R.gridDual);R.gridDual.geometry.dispose();R.gridDual=null}
  if(R.gridMain){R.scene.remove(R.gridMain);R.gridMain.geometry.dispose();R.gridMain=null}
  if(S.showGrid){S.showGrid=false;toggleGrid()}
  buildUI();
  setSpeed(1);
  if(S.paused)togglePause();
  genViewer(); // режим «генератор»: каждый запуск показывает сборку карты по шагам
}
function boot(){
  const seed=String((Math.random()*1e9)|0);
  newGame(seed);
  buildAtlas();
  const errs=validateSprites();
  if(errs.length)console.warn('sprite grid issues:',errs);
  console.log('[Марка] атлас за '+S.atlasMs.toFixed(1)+' мс, сид '+seed);
  initRender();
  buildUI();
  genViewer(); // режим «генератор»: показать сборку стартовой карты
  let last=performance.now(),acc=0,uiT=0,fps=0,fc=0,ft=0;
  function frame(t){
    const dtR=Math.min(0.1,(t-last)/1000);last=t;
    if(!S.paused){
      acc+=dtR*S.speed;
      let guard=0;
      while(acc>=CFG.STEP&&guard++<300){tick(CFG.STEP);acc-=CFG.STEP}
      if(guard>=300)acc=0;
    }
    keysPan(dtR);
    if(S.terrDirty)buildTerrain();
    if(S.roadDirty)buildRoads();
    if(S.featDirty)buildStatics();
    if(S.bldDirty)buildBuildings();
    if(S.fogDirty)paintFog();
    fillUnits(S.paused?1:clamp(acc/CFG.STEP,0,1));
    fillFx();
    const nT=S.isNight?0.62:0;
    R.nightO+=(nT-R.nightO)*Math.min(1,dtR*2.5);
    R.night.material.opacity=R.nightO;
    fillGlow();
    updateCam();
    updatePopups(dtR);
    updatePortBars();
    R.renderer.render(R.scene,R.camera);
    fc++;ft+=dtR;if(ft>=1){fps=fc;fc=0;ft=0}
    uiT-=dtR;if(uiT<=0){updateUI(fps);uiT=0.25}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

