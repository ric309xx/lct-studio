import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleModelGround, modelGroundFailure, ModelGroundError} from '../../viewer-source/src/modelGround.mjs';

test('模型取樣保留有效資料，不以零高度取代缺值', async () => {
  const points = [{height: undefined}, {height: 23.4}, {height: NaN}];
  assert.equal(await sampleModelGround(async () => points), points);
  assert.equal(points[0].height, undefined);
  await assert.rejects(sampleModelGround(async () => [{height: undefined}, {height: NaN}]), error => error.code === 'no-height');
  assert.match(modelGroundFailure(new ModelGroundError('no-height')).message, /沒有可用的模型高度/);
});

test('永不完成的取樣會逾時，不能永久留在準備中', async () => {
  await assert.rejects(sampleModelGround(() => new Promise(() => {}), {timeoutMs: 5}), error => error.code === 'timeout');
});

test('切換專案可取消取樣，不必等待逾時', async () => {
  const controller = new AbortController();
  const waiting = sampleModelGround(() => new Promise(() => {}), {signal: controller.signal});
  controller.abort();
  await assert.rejects(waiting, error => error.code === 'cancelled');
  let called = false;
  await assert.rejects(sampleModelGround(async () => {called = true; return [];}, {signal: controller.signal}), error => error.code === 'cancelled');
  assert.equal(called, false);
});

test('失敗診斷僅保留狀態碼，不能洩露上游秘密', async () => {
  const privateError = Object.assign(Error('https://example.test/?access_token=synthetic-do-not-print'), {statusCode: 413});
  let failure;
  try { await sampleModelGround(async () => {throw privateError;}); } catch (error) {failure = error;}
  assert.equal(failure.statusCode, 413);
  assert.doesNotMatch(JSON.stringify(failure), /example|synthetic|access_token/);
  assert.match(modelGroundFailure(failure).message, /平台限制/);
  assert.doesNotMatch(JSON.stringify(modelGroundFailure(privateError)), /example|synthetic|access_token/);
  const missingApi=modelGroundFailure(new TypeError('CallbackPositionProperty is not a constructor'));
  assert.equal(missingApi.errorType,'TypeError');
  assert.equal(missingApi.api,'CallbackPositionProperty');
});
