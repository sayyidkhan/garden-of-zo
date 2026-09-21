(async () => {
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const get = selector => document.querySelector(selector);
  const click = selector => get(selector).click();
  const atlas = get('[data-atlas]');
  const world = get('[data-atlas-world]');
  const camera = () => new DOMMatrixReadOnly(getComputedStyle(world).transform);
  const scale = () => camera().a;
  const results = [];
  const check = (name, passed) => {
    if (!passed) throw new Error(name);
    results.push(name);
  };
  const wheel = (deltaY, extra = {}) => {
    const bounds = atlas.getBoundingClientRect();
    atlas.dispatchEvent(new WheelEvent('wheel', {
      deltaY, clientX: bounds.x + bounds.width / 2, clientY: bounds.y + bounds.height / 2,
      bubbles: true, cancelable: true, ...extra
    }));
  };
  await pause(500);
  const readingScale = innerWidth < 620 ? .9 : .85;
  check('Starts at reading scale', scale() === readingScale);
  const visited = new Set();
  const count = document.querySelectorAll('[data-atlas-card]').length;
  for (let i = 0; i < count; i++) {
    click('[data-atlas-next]');
    await pause(400);
    const active = get('.kingdom-node.is-active');
    visited.add(active.dataset.nodeTitle);
    const label = active.querySelector('.kingdom-node__label').getBoundingClientRect();
    const bounds = atlas.getBoundingClientRect();
    check('Reachable: ' + active.dataset.nodeTitle, label.left >= bounds.left - 1 && label.right <= bounds.right + 1 && label.top >= bounds.top - 1 && label.bottom <= bounds.bottom + 1);
  }
  check('All kingdoms retain selection after stepping', visited.size === count);
  let started = 0;
  const originalAnimate = world.animate;
  world.animate = function (...args) { started++; return originalAnimate.apply(this, args); };
  try {
    for (let i = 0; i < 20; i++) { wheel(-1, { ctrlKey: true }); await pause(20); }
    const during = scale();
    check('Zoom responds during a continuous gesture', during > readingScale * 1.05);
    check('Gesture zoom does not restart camera animations', started === 0);
    await pause(400);
    check('Zoom does not catch up after gesture ends', Math.abs(scale() - during) < .00001);
  } finally { world.animate = originalAnimate; }
  const beforeReverse = scale();
  wheel(20, { ctrlKey: true });
  await pause(70);
  check('Zoom reverses promptly', scale() < beforeReverse);
  click('[data-atlas-explore]');
  await pause(400);
  click('[data-atlas-next]');
  await pause(60);
  wheel(100, { shiftKey: true });
  const stoppedAt = camera().e;
  check('Wheel cancels camera travel', !atlas.classList.contains('is-zooming'));
  await pause(400);
  check('Wheel position survives old camera completion', Math.abs(camera().e - stoppedAt) < 1);
  click('[data-atlas-next]');
  await pause(60);
  atlas.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
  const touchTop = camera().f;
  check('Touch takes over camera immediately', !atlas.classList.contains('is-zooming'));
  window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', bubbles: true }));
  await pause(400);
  check('Touch interruption remains stable', Math.abs(camera().f - touchTop) < 1);
  let statusChanges = 0;
  const observer = new MutationObserver(records => { statusChanges += records.length; });
  observer.observe(get('[data-atlas-status]'), { childList: true, characterData: true, subtree: true });
  for (let i = 0; i < 20; i++) { wheel(i < 10 ? 4 : -4, { shiftKey: true }); await pause(20); }
  await pause(200);
  observer.disconnect();
  check('Panning does not rewrite unchanged status', statusChanges === 0);
  click('.kingdom-node.is-active [data-atlas-select]');
  await pause(450);
  check('Focus keeps arrival effect', !!get('.kingdom-node.is-active.is-arrived'));
  click('[data-atlas-reset]');
  await pause(600);
  check('Overview remains available', scale() < .5);
  get('[data-atlas-explore]').click();
  await pause(800);
  check('Explore returns to reading scale', Math.abs(scale() - readingScale) < .00001);
  click('[data-filter="private"]');
  await pause(400);
  const privateCards = [...document.querySelectorAll('[data-atlas-card][data-access="private"]')];
  check('Access filter works', privateCards.length > 0 && privateCards.every(card => !card.hidden) && [...document.querySelectorAll('[data-atlas-card][data-access="public"]')].every(card => card.hidden));
  click('[data-kind-filter="workflow"]');
  await pause(200);
  check('Empty filter is handled', get('[data-atlas-status]').textContent.includes('adjust filters'));
  click('[data-filter="all"]');
  click('[data-kind-filter="all"]');
  await pause(400);
  click('[data-view="list"]');
  check('List retains destinations', !get('[data-view-panel="list"]').hidden && document.querySelectorAll('[data-list-card]:not([hidden])').length === count);
  click('[data-view="atlas"]');
  await pause(300);
  check('Atlas toggle retains existing route', location.hash === '#atlas');
  check('No horizontal page overflow', document.documentElement.scrollWidth === innerWidth);
  check('Private links retain authentication boundary', [...document.querySelectorAll('[data-atlas-card][data-access="private"] .kingdom-node__enter')].every(link => link.href.startsWith('https://private-apps-sayyidkhan.zo.computer/')));
  return { viewport: { width: innerWidth, height: innerHeight }, passed: results.length, checks: results };
})()
