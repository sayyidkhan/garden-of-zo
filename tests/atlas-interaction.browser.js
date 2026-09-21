(async () => {
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const get = selector => document.querySelector(selector);
  const api = window.__skyAtlas;
  if (!api) throw new Error('Canvas renderer is not ready');
  const results = [];
  const check = (name, passed) => { if (!passed) throw new Error(name); results.push(name); };
  const click = selector => get(selector).click();
  const settle = async () => { for (let i = 0; i < 100 && api.viewport.plugins.get('animate'); i++) await pause(20); };
  const data = JSON.parse(get('#atlas-data').textContent);
  check('WebGL canvas is active', api.state().renderer === 'webgl' && !!get('[data-atlas] canvas'));
  check('Starts with an unobstructed map', !api.state().panel);
  const before = api.state();
  api.select('zo-drive');
  await pause(100);
  check('Selection opens details without moving or zooming', api.state().panel && api.state().x === before.x && api.state().scale === before.scale);
  for (const realm of data.realms) {
    api.select(realm.id);
    check('Correct destination: ' + realm.title, get('[data-realm-enter]').getAttribute('href') === realm.href && get('[data-realm-source]').href === realm.repositoryUrl);
  }
  click('[data-panel-close]');
  const pan = api.state();
  click('[data-filter="private"]');
  await pause(100);
  check('Private filter retains camera position', api.state().x === pan.x && api.state().y === pan.y && api.state().scale === pan.scale);
  check('Private filter shows only private realms', api.state().visible.length === data.realms.filter(r => r.access === 'private').length);
  click('[data-kind-filter="workflow"]');
  check('Empty filter has a visible explanation', api.state().visible.length === 0 && !get('[data-atlas-empty]').hidden);
  click('[data-filter="all"]'); click('[data-kind-filter="all"]');
  click('[data-atlas-reset]'); await settle();
  check('Overview fits all kingdoms', api.state().scale < .5);
  api.select('zo-drive'); click('[data-panel-close]'); click('[data-atlas-explore]'); await settle();
  check('Explore returns to readable scale', Math.abs(api.state().scale - (innerWidth < 620 ? .64 : .72)) < .001);
  const previous = api.state();
  click('[data-view="list"]');
  check('List shows every destination', !get('[data-view-panel="list"]').hidden && document.querySelectorAll('[data-list-card]:not([hidden])').length === data.realms.length);
  click('[data-view="atlas"]'); await pause(100);
  check('Returning to Atlas retains camera', api.state().x === previous.x && api.state().scale === previous.scale);
  check('Existing Atlas route retained', location.hash === '#atlas');
  check('Private destinations cross authentication boundary', data.realms.filter(r => r.access === 'private').every(r => r.href.startsWith('https://private-apps-sayyidkhan.zo.computer/') || (location.port === '9100' && r.href.startsWith('/'))));
  check('No page overflow', document.documentElement.scrollWidth === innerWidth);
  return { passed: results.length, checks: results };
})()
