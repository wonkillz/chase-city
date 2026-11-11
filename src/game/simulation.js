import {CONFIG,clamp,angleDelta} from './config.js';
import {resolveBuilding} from '../world/layout.js';
export class Simulation{
 constructor(layout){this.layout=layout;this.reset();}
 reset(){this.player={x:0,z:8,angle:0,vx:0,vz:-18,speed:18};this.health=100;this.elapsed=0;this.arrest=0;this.hitCooldown=0;this.result=null;this.collisions=0;this.police=Array.from({length:CONFIG.policeCount},(_,i)=>({x:(i%2?1:-1)*3,z:30+i*9,angle:0,vx:0,vz:0,speed:17+i*.4,stuck:0}));}
 damage(amount){if(this.hitCooldown<=0){this.health=Math.max(0,this.health-amount);this.hitCooldown=.65;this.collisions++;}}
 move(body,dt){let hit=false;const steps=Math.ceil(Math.hypot(body.vx,body.vz)*dt/.6)||1;
 for(let i=0;i<steps;i++){body.x+=body.vx*dt/steps;body.z+=body.vz*dt/steps;for(const b of this.layout.buildings)if(resolveBuilding(body,b))hit=true;const x=body.x,z=body.z;body.x=clamp(x,-106,106);body.z=clamp(z,-106,106);if(x!==body.x||z!==body.z)hit=true;}return hit;}
 update(dt,input){if(this.result)return;dt=Math.min(dt,.05);this.elapsed+=dt;this.hitCooldown-=dt;const p=this.player;
 p.angle+=((input.left?1:0)-(input.right?1:0))*CONFIG.turnRate*(input.drift?1.45:1)*dt;
 const target=input.drift?CONFIG.driftSpeed:CONFIG.playerSpeed;p.speed+=(target-p.speed)*dt*2;
 const grip=1-Math.exp(-(input.drift?3:10)*dt);p.vx+=(-Math.sin(p.angle)*p.speed-p.vx)*grip;p.vz+=(-Math.cos(p.angle)*p.speed-p.vz)*grip;
 if(this.move(p,dt)){this.damage(12);p.speed=7;p.vx*=.55;p.vz*=.55;}
 let nearby=0;
 for(let i=0;i<this.police.length;i++){const c=this.police[i];const dx=p.x-c.x,dz=p.z-c.z,dist=Math.hypot(dx,dz);
 // Road graph routing: reach a road centre, then use an intersection before approaching the player.
 const roadX=Math.round(c.x/30)*30,roadZ=Math.round(c.z/30)*30;let tx=p.x,tz=p.z;
 if(dist>14){if(Math.abs(c.x-roadX)<Math.abs(c.z-roadZ)){tx=roadX;tz=Math.round(p.z/30)*30;if(Math.abs(c.z-tz)<3){tx=p.x;tz=Math.round(p.z/30)*30;}}else{tx=Math.round(p.x/30)*30;tz=roadZ;if(Math.abs(c.x-tx)<3){tx=Math.round(p.x/30)*30;tz=p.z;}}}
 if(c.stuck>1){tx=c.x+Math.sin(c.angle)*12;tz=c.z+Math.cos(c.angle)*12;}
 const desired=Math.atan2(-(tx-c.x),-(tz-c.z));c.angle+=clamp(angleDelta(desired,c.angle),-2.4*dt,2.4*dt);
 const speed=Math.min(23,c.speed+this.elapsed*.025);c.vx=-Math.sin(c.angle)*speed;c.vz=-Math.cos(c.angle)*speed;
 if(this.move(c,dt)){c.stuck+=dt;c.angle+=dt*2;}else c.stuck=Math.max(0,c.stuck-dt*.5);if(c.stuck>2.5)c.stuck=0;
 const separation=Math.hypot(p.x-c.x,p.z-c.z);
 if(separation<2.5){const nx=(p.x-c.x)/(separation||1),nz=(p.z-c.z)/(separation||1);p.x+=nx*.18;p.z+=nz*.18;c.x-=nx*.18;c.z-=nz*.18;this.damage(8);p.speed=Math.max(3,p.speed-dt*15);}
 if(separation<7)nearby++;
 for(let j=0;j<i;j++){const other=this.police[j],d=Math.hypot(c.x-other.x,c.z-other.z);if(d<2.6&&d>.001){c.x+=(c.x-other.x)/d*.1;c.z+=(c.z-other.z)/d*.1;}}
 }
 // Resolve post-impact displacement as well, so no push can put a vehicle through a building.
 for(const b of this.layout.buildings){resolveBuilding(p,b);for(const c of this.police)resolveBuilding(c,b);}
 this.arrest=clamp(this.arrest+(nearby>=2&&Math.hypot(p.vx,p.vz)<10?dt:-dt*.7),0,CONFIG.arrestSeconds);
 if(this.health<=0)this.result='destroyed';else if(this.arrest>=CONFIG.arrestSeconds)this.result='arrested';
 }
}
