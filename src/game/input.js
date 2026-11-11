export class Input{
 constructor(onPause){this.keys=new Set();this.pointers=new Map();this.onPause=onPause;
 window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight',' ','ArrowUp','ArrowDown'].includes(e.key))e.preventDefault();this.keys.add(e.code);if(!e.repeat&&(e.code==='KeyP'||e.code==='Escape'))onPause();});
 window.addEventListener('keyup',e=>this.keys.delete(e.code));
 window.addEventListener('blur',()=>this.clear());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();});
 for(const button of document.querySelectorAll('[data-control]')){button.addEventListener('pointerdown',e=>{e.preventDefault();if(e.isTrusted)button.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,button.dataset.control);button.classList.add('pressed');});for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,e=>{this.pointers.delete(e.pointerId);button.classList.remove('pressed');});}
 }
 clear(){this.keys.clear();this.pointers.clear();document.querySelectorAll('.pressed').forEach(b=>b.classList.remove('pressed'));}
 get left(){return this.keys.has('ArrowLeft')||this.keys.has('KeyA')||[...this.pointers.values()].includes('left');}
 get right(){return this.keys.has('ArrowRight')||this.keys.has('KeyD')||[...this.pointers.values()].includes('right');}
 get drift(){return this.keys.has('Space')||[...this.pointers.values()].includes('drift');}
}
