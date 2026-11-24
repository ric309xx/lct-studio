import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

test('form pages preserve same-origin POST Origin without exposing cross-origin referrers', async () => {
  for (const project of ['nanya', 'longteng-20260906']) {
    const response = await worker.fetch(new Request(`https://worker.test/?project=${project}`), {});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('referrer-policy'), 'same-origin');
    assert.match(await response.text(), /action="\/login" method="post"/);
  }
});

test('form login and logout continue rejecting null, missing and foreign origins', async () => {
  for (const pathname of ['/login', '/logout']) {
    for (const origin of [null, 'null', 'https://foreign.test']) {
      const headers = origin === null ? {} : { Origin: origin };
      const response = await worker.fetch(new Request(`https://worker.test${pathname}`, {method:'POST', headers}), {});
      assert.equal(response.status, 403);
    }
  }
});
