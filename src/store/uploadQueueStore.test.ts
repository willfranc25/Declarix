import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({jobs:vi.fn(),upload:vi.fn(),patch:vi.fn(),request:vi.fn()}));
vi.mock('../services/jobService',()=>({listJobs:mocks.jobs,uploadDocument:mocks.upload,patchReview:mocks.patch,documentRequest:mocks.request}));
vi.mock('../services/supabaseClient',()=>({supabase:{from:()=>({select:()=>({eq:()=>({in:()=>({range:async()=>({data:[],error:null})})})})}),storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://example.test/preview'}})})}}}));
import store from '../store/uploadQueueStore';
import {setActiveOrganization} from '../services/organizationService';
const company=(id:string)=>({id,accountant_id:'user',name:id,archived:false});
beforeEach(()=>{vi.clearAllMocks();store.getState().reset();setActiveOrganization(company('a'));mocks.patch.mockResolvedValue(undefined);mocks.upload.mockResolvedValue('new');mocks.jobs.mockResolvedValue([]);});
const ready={id:'job',filename:'photo.png',mime_type:'image/png',status:'ready',file_bytes:20,object_path:'user/a/job',result:{documents:[{providerName:'A',date:null,totalAmount:null}]},review:{}};
describe('durable company queue',()=>{
 it('retains unknown fields and provenance for manual review',async()=>{
  mocks.jobs.mockResolvedValue([ready]);await store.getState().hydrate();
  expect(store.getState().queue[0].extractedData).toMatchObject({date:null,totalAmount:null,source_job_id:'job',source_index:0,imagePath:'user/a/job'});
 });
 it('does not leak a delayed result into a different company',async()=>{
  let release:any;mocks.jobs.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const pending=store.getState().hydrate();setActiveOrganization(company('b'));store.getState().reset();release([ready]);await pending;
  expect(store.getState().queue).toEqual([]);
 });
 it('captures company before uploading and stops the batch on a switch',async()=>{
  let release:any;mocks.upload.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const pending=store.getState().addFiles([new File(['a'],'a.png'),new File(['b'],'b.png')]);
  setActiveOrganization(company('b'));store.getState().reset();release('job');await pending;
  expect(mocks.upload).toHaveBeenCalledTimes(1);expect(mocks.upload.mock.calls[0][1]).toBe('a');
 });
 it('merges corrections in sequence and persists a dismissal',async()=>{
  mocks.jobs.mockResolvedValue([ready]);await store.getState().hydrate();
  store.getState().updateReview('job:0',{providerName:'B'});store.getState().updateReview('job:0',{notes:'Reviewed'});
  await store.getState().flushReviews();
  expect(mocks.patch.mock.calls).toEqual([['job',0,{providerName:'B'}],['job',0,{notes:'Reviewed'}]]);
  mocks.jobs.mockResolvedValue([{...ready,review:{0:{_dismissed:true}}}]);await store.getState().removeItem('job:0');
  expect(store.getState().queue).toEqual([]);
 });
 it('resumes an uploaded draft using enqueue without uploading again',async()=>{
  mocks.jobs.mockResolvedValue([{...ready,status:'uploading'}]);await store.getState().hydrate();await store.getState().retryItem('job');
  expect(mocks.request).toHaveBeenCalledWith('enqueue',{jobId:'job'});expect(mocks.upload).not.toHaveBeenCalled();
 });
});
