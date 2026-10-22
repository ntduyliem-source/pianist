import test from 'node:test';
import assert from 'node:assert/strict';
import {RetryableLoad} from '../src/exercises/retryable-load';

test('a transient prefetch failure retries the same exercise without advancing the queue',async()=>{
  const requested:string[]=[];let online=false;
  const queue=['first','second','third'].map(id=>new RetryableLoad(async()=>{
    requested.push(id);if(id==='second'&&!online)throw Error('Network unavailable');return{id};
  }));
  await queue[0].read();await assert.rejects(queue[1].read(),/Network/);await queue[2].read();queue.shift();
  await assert.rejects(queue[0].read(),/Network/);online=true;
  const [a,b]=await Promise.all([queue[0].read(),queue[0].read()]);
  assert.equal(a.id,'second');assert.equal(a,b);queue.shift();
  assert.equal((await queue[0].read()).id,'third');
  assert.deepEqual(requested,['first','second','third','second','second']);
});
