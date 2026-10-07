import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createDocumentsHandler } from '../api/documents.js';

const jobId = '11111111-1111-4111-8111-111111111111';
const companyId = '22222222-2222-4222-8222-222222222222';
const response = () => ({ setHeader() {}, status(code) { this.code=code;return this; }, json(body) { this.body=body;return this; } });
async function fixture() {
  const bytes = await sharp({create:{width:20,height:20,channels:3,background:'white'}}).png().toBuffer();
  const job={id:jobId,user_id:'owner',organization_id:companyId,status:'uploading',mime_type:'image/png',file_bytes:bytes.length,object_path:'owner/company/photo'};
  const calls=[];
  const db={
    auth:{getUser:async()=>({data:{user:{id:'owner'}}})},
    from:()=>({select:()=>({eq:(field,value)=>{
      assert.equal(field,'id');assert.equal(value,jobId);
      return {eq:(field,value)=>{assert.equal(field,'user_id');assert.equal(value,'owner');return {single:async()=>({data:job})};}};
    }})}),
    storage:{from:()=>({download:async()=>({data:new Blob([bytes])})})},
    rpc:async(name,args)=>{calls.push({name,args});if(name==='enqueue_extraction'){job.status='uploaded';return {data:job};}return {data:1};},
  };
  const invoke=async(body,headers={authorization:'Bearer test'})=>{
    const res=response();await createDocumentsHandler(()=>db)({method:'POST',headers,body},res);return res;
  };
  return {job,calls,invoke};
}
test('complete and legacy enqueue validate and stage originals; neither starts extraction',async()=>{
  for(const action of ['complete','enqueue']) {
    const f=await fixture();const res=await f.invoke({action,jobId});
    assert.equal(res.code,200);assert.equal(res.body.status,'uploaded');
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'enqueue_extraction');
    assert.match(f.calls[0].args.p_hash,/^[a-f0-9]{64}$/);assert.equal(f.calls[0].args.p_pages,1);
    await f.invoke({action,jobId});assert.equal(f.calls.length,1,'Completing twice must not queue or reserve');
  }
});
test('a truncated upload cannot become successfully uploaded',async()=>{
  const f=await fixture();f.job.file_bytes++;
  const res=await f.invoke({action:'complete',jobId});
  assert.equal(res.code,400);assert.equal(f.job.status,'uploading');assert.equal(f.calls.length,0);
});
test('only authenticated explicit confirmation submits a bounded company snapshot',async()=>{
  const f=await fixture();
  assert.equal((await f.invoke({action:'start',companyId,jobIds:[jobId]},{})).code,401);
  for(const jobIds of [[],['invalid'],Array(1001).fill(jobId)]) assert.equal((await f.invoke({action:'start',companyId,jobIds})).code,400);
  assert.equal(f.calls.length,0);
  const res=await f.invoke({action:'start',companyId,jobIds:[jobId,jobId]});
  assert.equal(res.code,200);assert.equal(res.body.started,1);
  assert.deepEqual(f.calls,[{name:'start_uploaded_extractions',args:{p_user:'owner',p_company:companyId,p_jobs:[jobId]}}]);
});
