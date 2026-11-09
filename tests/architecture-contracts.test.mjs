import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { errorBody, proxyFailure, sanitizeProxyRequest } from '../services/api-gateway/src/contracts.js';
import { createAttemptRelay } from '../services/quiz-service/src/infrastructure/attemptClient.js';
import { apiFailure } from '../apps/desktop-web/src/api/errorContract.js';

test('independently packaged services use the same closest-match rules', () => {
  const source = service => readFileSync(new URL(`../services/${service}/src/services/closestSearch.js`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  for (const service of ['challenge-service', 'admin-service', 'message-service']) {
    assert.equal(source(service), source('social-service'), service);
  }
});

test('gateway errors preserve legacy clients and expose a classified, correlated contract', () => {
  for (const status of [400,401,403,404,409,413,429,502,503,504,500]) {
    const body = errorBody(status, 'Safe message', 'request-123');
    assert.equal(body.success, false);
    assert.equal(body.message, body.error.message);
    assert.equal(apiFailure({ response: { status, data: body } }).code, body.error.code);
    assert.equal(body.requestId, 'request-123');
  }
  assert.equal(proxyFailure({ code: 'ETIMEDOUT', message: 'private address' }).status, 504);
  assert.equal(proxyFailure({ code: 'ECONNREFUSED' }).status, 502);
  assert.equal(apiFailure({response: {status:403, data:{message:'Legacy permission denial'}}}).message, 'Legacy permission denial');
  assert.equal(apiFailure({}).status, 0);
});

test('edge forwarding removes privileged identity claims and preserves verified credentials', () => {
  const headers = new Map(Object.entries({authorization:'Bearer credential',cookie:'accessToken=credential','x-user-id':'forged','x-internal-token':'forged','x-role':'admin'}));
  sanitizeProxyRequest({ removeHeader: k => headers.delete(k), setHeader: (k,v) => headers.set(k,v) },
    {headers:Object.fromEntries(headers),requestId:'request-123',ip:'127.0.0.1'});
  assert.equal(headers.has('x-user-id'), false); assert.equal(headers.has('x-internal-token'), false); assert.equal(headers.has('x-role'),false);
  assert.equal(headers.get('authorization'),'Bearer credential');
  assert.equal(headers.get('x-forwarded-for'),'127.0.0.1');
});

test('Quiz compatibility transport preserves attempt contracts without forwarding identity assertions', async () => {
  let calls=0;
  const req={method:'PUT', originalUrl:'/api/v1/quiz/!QZ-ABC123/attempt/id/sync-progress',headers:{cookie:'session',authorization:'Bearer token','x-user-id':'forged','x-client-session-id':'guest'},body:{totalElapsedMs:1000}};
  const res=Object.assign(new EventEmitter(),{status(code){this.code=code;return this;},json(body){this.body=body;}});
  const relay=createAttemptRelay({origin:'http://attempt:5004',fetchImpl:async (url,options)=>{
    calls++;assert.equal(url.pathname,req.originalUrl);assert.equal(options.headers['x-user-id'],undefined);
    assert.equal(options.headers.authorization,'Bearer token');assert.equal(options.headers['x-client-session-id'],'guest');
    assert.equal(options.redirect,'manual');assert.deepEqual(JSON.parse(options.body),req.body);
    return {status:200,json:async()=>({success:true,data:{attempt:{status:'in_progress'}}})};
  }});
  await relay(req,res,error=>{throw error;});
  assert.equal(calls,1);assert.equal(res.body.data.attempt.status,'in_progress');
  for (const origin of ['http://user:secret@host','ftp://host','http://host/private','http://host?secret=yes']) assert.throws(()=>createAttemptRelay({origin}));
});

test('compatibility transport returns bounded failures and never retries a write', async () => {
  let calls=0;
  const relay=createAttemptRelay({origin:'http://attempt',timeoutMs:100,fetchImpl:async (url,{signal})=>{
    calls++;await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('private timeout detail'))));
  }});
  let failure;
  await relay({method:'POST',originalUrl:'/api/v1/quiz/id/attempt',headers:{},body:{}},new EventEmitter(),error=>{failure=error;});
  assert.equal(failure.statusCode,504);assert.equal(calls,1);assert.equal(failure.message.includes('private'),false);
});

test('compatibility relay aborts downstream work when the client disconnects', async () => {
  const res=new EventEmitter();
  let aborted=false, propagated=false;
  const relay=createAttemptRelay({origin:'http://attempt',fetchImpl:async (url,{signal})=>{
    return new Promise((resolve,reject)=>{
      signal.addEventListener('abort',()=>{aborted=true;reject(new Error('cancelled'));});
      res.destroyed=true;
      res.emit('close');
    });
  }});
  await relay({method:'POST',originalUrl:'/api/v1/quiz/id/attempt',headers:{},body:{}},res,()=>{propagated=true;});
  assert.equal(aborted,true);assert.equal(propagated,false);
});

test('compatibility relay cannot be redirected by an absolute request target or path traversal', async () => {
  let calls=0;
  const relay=createAttemptRelay({origin:'http://attempt',fetchImpl:async()=>{calls++;}});
  for (const originalUrl of ['http://evil.example/api/v1/quiz/id/attempt','//evil.example/api/v1/quiz/id/attempt','/api/v1/quiz/../../admin']) {
    let error;
    await relay({originalUrl,headers:{}},new EventEmitter(),failure=>{error=failure;});
    assert.equal(error.statusCode,400);
  }
  assert.equal(calls,0);
});
