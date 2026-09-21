import { execFileSync } from 'node:child_process';
import { createHandler } from '../server';

const root = new URL('../', import.meta.url).pathname;
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: createHandler(root + 'public.routes.json') });
const session = 'sky-atlas-camera-' + process.pid;
execFileSync('agent-browser', ['--session', session, 'open', 'about:blank']);
const browserUrl = execFileSync('agent-browser', ['--session', session, 'get', 'cdp-url'], { encoding: 'utf8' }).trim();
const targets = await fetch('http://127.0.0.1:' + new URL(browserUrl).port + '/json/list').then(r => r.json());
const socket = new WebSocket(targets.find((t: any) => t.type === 'page').webSocketDebuggerUrl);
await new Promise<void>(resolve => socket.addEventListener('open', () => resolve(), { once: true }));
let id = 0;
const pending = new Map<number, any>();
const errors: string[] = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(String(event.data));
  if (message.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(message.params.exceptionDetails));
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
});
const send = (method: string, params = {}) => new Promise<any>((resolve, reject) => {
  const requestId = ++id;
  const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Timed out: ' + method)); }, 30000);
  pending.set(requestId, { resolve, reject, timer });
  socket.send(JSON.stringify({ id: requestId, method, params }));
});
const evaluate = async (expression: string) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const results: string[] = [];
const check = (name: string, passed: boolean) => { if (!passed) throw new Error(name); results.push(name); };
const camera = () => evaluate("(()=>{const s=window.__skyAtlas.state(),b=document.querySelector('[data-atlas]').getBoundingClientRect();return {...s,z:s.scale,width:b.width,height:b.height,top:b.top,left:b.left};})()");
const click = (selector: string) => evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
const move = (x: number, y: number) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
const mouse = (type: string, x: number, y: number) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
const wheel = (x: number, y: number, deltaY: number, modifiers = 0) => send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY, modifiers });
const key = (type: string, key: string, code: string) => send('Input.dispatchKeyEvent', { type, key, code });
const box = (selector: string) => evaluate('(()=>{const b=document.querySelector(' + JSON.stringify(selector) + ').getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};})()');
const metrics = async () => Object.fromEntries((await send('Performance.getMetrics')).metrics.map((m: any) => [m.name, m.value]));
const url = process.env.ATLAS_TEST_URL || 'http://127.0.0.1:' + server.port + '/#atlas';

try {
  await send('Runtime.enable');
  await send('Performance.enable');
  for (const mobile of [false, true]) {
    const label = mobile ? 'mobile' : 'desktop';
    await send('Emulation.setDeviceMetricsOverride', { width: mobile ? 390 : 1440, height: mobile ? 844 : 1000, deviceScaleFactor: 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
    await send('Page.navigate', { url: 'about:blank' });
    await send('Page.navigate', { url });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate('!!window.__skyAtlas')) break;
      await pause(100);
    }
    const regressions = await evaluate(await Bun.file(root + 'tests/atlas-interaction.browser.js').text());
    results.push(...regressions.checks.map((name: string) => label + ': ' + name));
    const start = await camera();
    const anchor = { x: start.width * .38, y: start.height * .42 };
    await wheel(anchor.x, start.top + anchor.y, -60);
    await pause(160);
    const zoomed = await camera();
    check(label + ': plain wheel zooms', zoomed.z > start.z);
    check(label + ': zoom anchored under cursor', Math.abs((anchor.x-start.x)/start.z-(anchor.x-zoomed.x)/zoomed.z)<1 && Math.abs((anchor.y-start.y)/start.z-(anchor.y-zoomed.y)/zoomed.z)<1);
    await pause(200);
    check(label + ': zoom settles promptly', Math.abs((await camera()).z-zoomed.z)<.001);
    await click('[data-atlas-explore]'); await pause(400);
    const before = await camera();
    const x = before.width / 2, y = before.top + before.height / 2;
    await mouse('mousePressed', x, y);
    for(let i=1;i<=10;i++){ await move(x+i*10,y+i*4); await pause(16); }
    const dragged = await camera();
    check(label + ': artwork drag follows pointer', Math.abs(dragged.x-before.x-100)<12 && Math.abs(dragged.y-before.y-40)<8);
    await move(x+110,y+44);
    await mouse('mouseReleased', x+110,y+44);
    const released = await camera();
    await pause(160);
    const glide = await camera();
    console.log(label, 'drag movement', { before: before.x, dragged: dragged.x, glide: glide.x, fps: await evaluate('window.__skyAtlas.app.ticker.FPS') });
    check(label + ': drag does not select or open panel', !glide.panel && glide.selected===before.selected);
    check(label + ': release has controlled momentum', glide.x>released.x+1 && glide.x<released.x+220);
    await mouse('mousePressed', x,y);
    const stopped=await camera(); await pause(200);
    check(label + ': pressing stops momentum', Math.abs((await camera()).x-stopped.x)<1);
    await mouse('mouseReleased',x,y);
    await key('keyDown','Escape','Escape'); await key('keyUp','Escape','Escape');
    await click('[data-atlas-explore]'); await pause(400);
    const clickStart=await camera();
    await mouse('mousePressed',x,y); await mouse('mouseReleased',x,y); await pause(150);
    const clicked=await camera();
    check(label + ': click opens details with no camera jump', clicked.panel && Math.abs(clicked.x-clickStart.x)<1 && clicked.z===clickStart.z);
    await click('[data-panel-close]');
    await evaluate("document.querySelector('[data-atlas]').focus()");
    const keyboard=await camera();
    await key('keyDown','d','KeyD'); await pause(200);
    const midway=await camera(); await pause(200);
    const end=await camera(); await key('keyUp','d','KeyD');
    const keyReleased=await camera(); await pause(100);
    check(label + ': keyboard movement is continuous', midway.x<keyboard.x-40 && end.x<midway.x-40);
    check(label + ': key release stops movement', Math.abs((await camera()).x-keyReleased.x)<1);
    await click('[data-atlas-next]'); await pause(80);
    await mouse('mousePressed',x,y); const interrupted=await camera(); await pause(400);
    check(label + ': manual input interrupts travel', Math.abs((await camera()).x-interrupted.x)<1);
    await mouse('mouseReleased',x,y);
    await click('[data-panel-close]'); await click('[data-atlas-explore]'); await pause(400);
    const mini=await box('[data-atlas-minimap] svg');
    await mouse('mousePressed',mini.x+mini.w*.4,mini.y+mini.h*.4); await pause(60);
    await move(mini.x+mini.w*.65,mini.y+mini.h*.6); await pause(80);
    const miniMove=await camera();
    await move(mini.x+mini.w*.7,mini.y+mini.h*.65); await pause(80);
    const miniEnd=await camera(); await mouse('mouseReleased',mini.x+mini.w*.7,mini.y+mini.h*.65);
    check(label + ': mini-map drags continuously', miniEnd.x<miniMove.x-50 && miniEnd.y<miniMove.y-30);
    await click('[data-atlas-explore]'); await pause(400);
    if(mobile){
      const touch=(type:string,points:any[])=>send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:3,radiusY:3,force:1}))});
      const before=await camera(), cy=before.top+before.height*.5;
      await touch('touchStart',[[1,135,cy],[2,255,cy]]);
      for(let i=1;i<=6;i++){await touch('touchMove',[[1,135-i*5,cy],[2,255+i*5,cy]]);await pause(20);}
      const pinched=await camera();
      check('mobile: two fingers pinch the canvas', pinched.z>before.z*1.3 && pinched.z<before.z*1.65);
      check('mobile: pinch centre stays anchored',Math.abs((195-before.x)/before.z-(195-pinched.x)/pinched.z)<5);
      await touch('touchEnd',[[2,285,cy]]);
      await touch('touchMove',[[1,135,cy+20]]);await pause(70);
      const resumed=await camera();
      check('mobile: pinch resumes one-finger drag',Math.abs(resumed.x-pinched.x-30)<8 && Math.abs(resumed.y-pinched.y-20)<8);
      await touch('touchCancel',[]); await pause(400);
      check('mobile: cancellation clears every pointer', await evaluate('window.__skyAtlas.viewport.input.count()') === 0);
      await click('[data-atlas-explore]');await pause(400);
      const tap=await camera();
      await touch('touchStart',[[3,tap.width/2,tap.top+tap.height/2]]);
      await touch('touchEnd',[]);await pause(150);
      check('mobile: tap selects without zooming', (await camera()).panel && (await camera()).z===tap.z);
      const touchPanelShot=await send('Page.captureScreenshot',{format:'png'});
      await Bun.write(root+'_scratch/atlas-canvas-mobile-details.png',Buffer.from(touchPanelShot.data,'base64'));
      await click('[data-panel-close]');
    }
    await click('[data-atlas-explore]');await pause(400);
    await evaluate("document.querySelector('[data-atlas]').focus();window.frameSamples=[];window.sampling=true;let last=performance.now();function sample(now){window.frameSamples.push(now-last);last=now;if(window.sampling)requestAnimationFrame(sample)}requestAnimationFrame(sample)");
    const metricsBefore=await metrics();
    await key('keyDown','d','KeyD');await pause(1000);await key('keyUp','d','KeyD');
    const metricsAfter=await metrics();
    const samples=await evaluate('window.sampling=false;window.frameSamples');
    const frameTimes=samples.slice(1).sort((a:number,b:number)=>a-b);
    const layouts=metricsAfter.LayoutCount-metricsBefore.LayoutCount;
    console.log(label,JSON.stringify({layouts,frames:frameTimes.length,medianFrameMs:frameTimes[Math.floor(frameTimes.length/2)],p95FrameMs:frameTimes[Math.floor(frameTimes.length*.95)]}));
    check(label + ': pan avoids per-frame layout',layouts<10);
    await click('[data-atlas-explore]');await pause(400);
    const shot=await send('Page.captureScreenshot',{format:'png'});
    await Bun.write(root+'_scratch/atlas-canvas-'+label+'.png',Buffer.from(shot.data,'base64'));
    if(!mobile){
      await evaluate("window.__skyAtlas.select('zo-drive')");
      const panelShot=await send('Page.captureScreenshot',{format:'png'});
      await Bun.write(root+'_scratch/atlas-canvas-details.png',Buffer.from(panelShot.data,'base64'));
    }
  }
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await send('Page.navigate',{url:'about:blank'});await send('Page.navigate',{url});
  for(let attempt=0;attempt<100;attempt++){if(await evaluate('!!window.__skyAtlas'))break;await pause(100);}
  await click('[data-atlas-next]');
  check('Reduced motion skips camera animation', !await evaluate("!!window.__skyAtlas.viewport.plugins.get('animate')"));
  await evaluate("document.querySelector('[data-atlas] canvas').dispatchEvent(new Event('webglcontextlost',{cancelable:true}))");
  check('Graphics failure explains List fallback',await evaluate("document.querySelector('[data-atlas-loading]').textContent.includes('List View')"));
  await click('[data-view="list"]');
  check('List remains usable after graphics failure',await evaluate("!document.querySelector('[data-view-panel=list]').hidden"));
  check('No browser exceptions',errors.length===0);
  console.log(JSON.stringify({passed:results.length,checks:results},null,2));
} finally {
  if(errors.length) console.error('Browser errors:',errors);
  socket.close();server.stop();execFileSync('agent-browser',['--session',session,'close']);
}
