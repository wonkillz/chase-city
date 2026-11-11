import './style.css';
import {createLayout} from './world/layout.js';
import {Simulation} from './game/simulation.js';
import {Input} from './game/input.js';
import {CityRenderer} from './render/scene.js';
import {Interface} from './ui/interface.js';
const ui=new Interface(),sim=new Simulation(createLayout());let renderer,state='ready';
function pause(){if(state==='running'){state='paused';input.clear();ui.showPause();}else if(state==='paused'){state='running';ui.hide();}}
const input=new Input(pause);
try{renderer=new CityRenderer(document.querySelector('#game'),sim.layout);}catch(error){document.querySelector('#message').textContent='3D 그래픽을 시작할 수 없습니다. WebGL을 지원하는 브라우저에서 다시 시도하세요.';ui.start.disabled=true;console.error(error);}
ui.start.addEventListener('click',()=>{if(!renderer)return;if(state!=='paused'){sim.reset();renderer.reset();}state='running';input.clear();ui.hide();});
document.querySelector('#pause').addEventListener('click',pause);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='running')pause();});
window.addEventListener('blur',()=>{if(state==='running')pause();});
let last=0,accumulator=0;function frame(ms){requestAnimationFrame(frame);const dt=Math.min((ms-last)/1000,.1);last=ms;if(state==='running'){accumulator+=dt;while(accumulator>=1/60){sim.update(1/60,input);accumulator-=1/60;if(sim.result){state='over';ui.gameover(sim);break;}}}else accumulator=0;ui.update(sim);renderer?.render(sim,dt,state==='running'&&input.drift);}requestAnimationFrame(frame);
// Opt-in diagnostics for automated local tests; never enabled by normal play.
if(import.meta.env.DEV&&new URLSearchParams(location.search).has('debug'))window.__CHASE__={sim,input,get state(){return state;}};
