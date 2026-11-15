// CPU-only tour checks; these do not claim browser/WebGPU visual acceptance.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
for(const file of ['index.html','index.min.html']){
 const html=fs.readFileSync(file,'utf8'),code=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
 new vm.Script(code,{filename:file});
 for(const search of ['', '?demo=0','?demo=true','?demo=1']){
  const nodes={},events={},classes=new Set();let scheduled=0;
  const body={classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}};
  const node=id=>nodes[id]??=( {style:{},hidden:true,width:1280,height:720,setAttribute(){}} );
  const ctx={console,URLSearchParams,Float32Array,Math,performance,setTimeout,clearTimeout,
   requestAnimationFrame(){scheduled++},window:{location:{search},addEventListener(){}},
   document:{body,getElementById:node,querySelectorAll:()=>[],addEventListener:(name,fn)=>events[name]=fn}};
  vm.createContext(ctx);
  vm.runInContext(code.replace('init().catch(fail);','')+`;
   globalThis.api={state,demoMode,demoPath,demoPose,updateDemo,terrain,blocked,makeWorld,directions,enter,frame};
   globalThis.mockRenderer=()=>{
    let pass={setPipeline(){},setBindGroup(){},setVertexBuffer(){},draw(){},end(){}};
    device={queue:{writeBuffer(){},submit(){}},createCommandEncoder:()=>({beginRenderPass:()=>pass,finish(){}})};
    context={getCurrentTexture:()=>({createView(){}})};lightVP=new Float32Array(16);
   };`,ctx);
  const a=ctx.api;assert.equal(a.demoMode,search==='?demo=1');assert.equal(classes.has('demo'),a.demoMode);
  if(!a.demoMode)continue;
  a.makeWorld();ctx.mockRenderer();
  for(let i=0;i<=2500;i++){
   let t=i/100,p=a.demoPose(t);assert(p.pos.every(Number.isFinite));
   assert(p.pos[1]>=a.terrain(p.pos[0],p.pos[2])+1.74,'terrain clearance');
   assert(!a.blocked(...p.pos),'building/barrier clearance at '+t);
   assert.equal(p.flash,t>=9&&t<13);
   if(i){let prev=a.demoPose(t-.01);assert(Math.hypot(...p.pos.map((v,j)=>v-prev.pos[j]))<.8,'continuous position');
    let f1=[Math.sin(p.yaw)*Math.cos(p.pitch),Math.sin(p.pitch),-Math.cos(p.yaw)*Math.cos(p.pitch)];
    let f0=[Math.sin(prev.yaw)*Math.cos(prev.pitch),Math.sin(prev.pitch),-Math.cos(prev.yaw)*Math.cos(prev.pitch)];
    assert(f1.reduce((v,x,j)=>v+x*f0[j],0)>.98,'continuous view');}
  }
  // Look targets resolve the actual crossing, tower and shelter in their time slots.
  for(const [t,target] of [[14.5,[0,0,-72]],[16.5,[36,18,-66]],[20,[14,2.8,-11.8]]]){
   const p=a.demoPose(t);a.updateDemo(t);const f=a.directions().f,d=target.map((v,j)=>v-p.pos[j]),len=Math.hypot(...d);
   assert(f.reduce((sum,v,j)=>sum+v*d[j]/len,0)>.999);
  }
  a.updateDemo(0);assert.equal(node('demo-title').textContent,'BLACKOUT — From Board Game to 3D');
  a.updateDemo(25);assert.equal(node('demo-title').textContent,'AI Coding Agent POC | November 2026');
  const before=JSON.stringify(a.state.pos);events.keydown({code:'KeyW'});events.keydown({code:'KeyF'});events.mousemove({movementX:100,movementY:100});
  assert.equal(a.state.keys.size,0);assert.equal(JSON.stringify(a.state.pos),before);assert.equal(a.state.flash,false);
  // Actual frame loop: wall-clock duration includes slow frames and stops scheduling at 25s.
  a.frame(1000);assert.equal(a.state.elapsed,0);a.frame(10000);assert.equal(a.state.elapsed,9);assert(a.state.flash);
  a.frame(14000);assert.equal(a.state.elapsed,13);assert(!a.state.flash);
  const pending=scheduled;a.frame(26000);assert.equal(a.state.elapsed,25);assert.equal(scheduled,pending);
  const final=JSON.stringify(a.state.pos);a.frame(90000);assert.equal(a.state.elapsed,25);assert.equal(JSON.stringify(a.state.pos),final);
  assert.equal(node('demo-fill').style.transform,'scaleX(1)');
 }
 console.log(file+': syntax, query gating, 2501 clearance/continuity samples, landmarks, input isolation, flashlight and 25s final freeze PASS');
}
