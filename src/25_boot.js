if(IS_BROWSER){
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',boot);
  else boot();
}else{
  runHeadless();
}
//</GAME>
