if(IS_BROWSER){
  // PNG-юниты декодируются до boot: buildAtlas синхронный
  const go=()=>loadUnitImages().then(boot);
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',go);
  else go();
}else{
  runHeadless();
}
//</GAME>
