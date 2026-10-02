import { test } from "node:test";
import assert from "node:assert/strict";
import { handleDeveloperFormats } from "./developerFormats.js";
function response() { return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},json(v){this.body=v;return this;}}; }
function database(allowed) {
  const calls=[];
  return {calls,auth:{getUser:async()=>({data:{user:{id:"owner"}}})},rpc:async(name,args)=>{
    calls.push([name,args]);
    return {data:name==="developer_format_access" ? allowed : name==="developer_format_sample" ? {path:"private/path",filename:"receipt.jpg",mimeType:"image/jpeg",issues:[]} : {rows:[],total:0}};
  },storage:{from:()=>({createSignedUrl:async(path,seconds)=>{calls.push([path,seconds]);return {data:{signedUrl:"https://signed"}};}})}};
}
test("a customer cannot list formats, fetch samples or grant developer access in the body",async()=>{
  for(const action of ["list","sample","review"]) {
    const db=database(false),res=response();
    await handleDeveloperFormats({method:"POST",headers:{authorization:"Bearer token"},body:{action,p_user:"owner",allowed:true}},res,db);
    assert.equal(res.statusCode,403);
    assert.equal(db.calls.length,1);
    assert.equal(res.headers["Cache-Control"],"private, no-store");
  }
});
test("anonymous requests fail before private catalog queries",async()=>{
  const db=database(true),res=response();
  await handleDeveloperFormats({method:"POST",headers:{},body:{action:"list"}},res,db);
  assert.equal(res.statusCode,401);assert.equal(db.calls.length,0);
});
test("developer sample links are short-lived and require a catalog source",async()=>{
  const db=database(true),res=response();
  await handleDeveloperFormats({method:"POST",headers:{authorization:"Bearer token"},body:{action:"sample",jobId:"33333333-3333-4333-8333-333333333333",index:0}},res,db);
  assert.equal(res.statusCode,200);assert.equal(res.body.path,undefined);
  assert.deepEqual(db.calls.at(-1),["private/path",600]);
  assert.equal(db.calls[1][1].p_user,"owner");
});
