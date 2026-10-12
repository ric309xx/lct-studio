import test from 'node:test';import assert from 'node:assert/strict';
import {pbkdf2Sync,createHmac} from 'node:crypto';
import {createLoginProof,signLoginChallenge} from '../shared/loginProof.mjs';
test('登入憑證與既有 PBKDF2 100000 次雜湊相容，且只適用指定挑戰',async()=>{
  const password='test-only-password',salt='test-only-salt',challenge={challenge:crypto.randomUUID()+crypto.randomUUID(),salt,iterations:100000};
  const derived=pbkdf2Sync(password,salt,100000,32,'sha256'),proof=await createLoginProof(password,challenge);
  assert.equal(proof.proof,createHmac('sha256',derived).update('lct-control-points:login:v1:'+challenge.challenge).digest('hex'));
  assert.equal(await signLoginChallenge(derived,challenge.challenge),proof.proof);
  assert.notEqual(await signLoginChallenge(derived,crypto.randomUUID()),proof.proof);
  assert.notEqual((await createLoginProof('wrong',challenge)).proof,proof.proof);
  assert.ok(!Object.values(proof).includes(password));
  await assert.rejects(createLoginProof(password,{...challenge,iterations:1}),/版本不符/);
});
