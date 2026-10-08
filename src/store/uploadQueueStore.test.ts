import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({jobs:vi.fn(),upload:vi.fn(),patch:vi.fn(),request:vi.fn(),preview:vi.fn(),wake:vi.fn().mockResolvedValue(undefined)}));
vi.mock('../services/jobService',()=>({listJobs:mocks.jobs,listInvoiceKeys:vi.fn().mockResolvedValue([]),fetchDocumentPreview:mocks.preview,uploadDocument:mocks.upload,patchReview:mocks.patch,documentRequest:mocks.request,wakeExtractionQueue:mocks.wake}));
vi.mock('../services/supabaseClient',()=>({supabase:{from:()=>({select:()=>({eq:()=>({in:()=>({range:async()=>({data:[],error:null})})})})}),storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://example.test/preview'}})})}}}));
import store from '../store/uploadQueueStore';
import {setActiveOrganization} from '../services/organizationService';
const company=(id:string)=>({id,accountant_id:'user',name:id,archived:false});
beforeEach(()=>{vi.clearAllMocks();mocks.request.mockReset().mockResolvedValue({started:1});store.getState().reset();setActiveOrganization(company('a'));mocks.patch.mockResolvedValue(undefined);mocks.upload.mockResolvedValue('new');mocks.jobs.mockResolvedValue([]);});
const ready={id:'job',filename:'photo.png',mime_type:'image/png',status:'ready',file_bytes:20,object_path:'user/a/job',result:{documents:[{providerName:'A',date:null,totalAmount:null}]},review:{}};
describe('durable company queue',()=>{
 it('retains unknown fields and provenance for manual review',async()=>{
  mocks.jobs.mockResolvedValue([ready]);await store.getState().hydrate();
  expect(store.getState().queue[0].extractedData).toMatchObject({date:null,totalAmount:null,source_job_id:'job',source_index:0,imagePath:'user/a/job'});
  expect(store.getState().queue[0].tempPreviewUrl).toBeNull();
 });
 it('does not leak a delayed result into a different company',async()=>{
  let release:any;mocks.jobs.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const pending=store.getState().hydrate();setActiveOrganization(company('b'));store.getState().reset();release([ready]);await pending;
  expect(store.getState().queue).toEqual([]);
 });
 it('starts at most three uploads and stops adding files after a company switch',async()=>{
  const releases:Array<(value:string)=>void>=[];
  mocks.upload.mockImplementation(()=>new Promise(resolve=>{releases.push(resolve);}));
  const files=['a','b','c','d'].map(name=>new File([name],`${name}.png`));
  const pending=store.getState().addFiles(files);
  expect(mocks.upload).toHaveBeenCalledTimes(3);
  setActiveOrganization(company('b'));store.getState().reset();
  releases.forEach(release=>release('job'));await pending;
  expect(mocks.upload).toHaveBeenCalledTimes(3);
  expect(mocks.upload.mock.calls.every((call)=>call[1]==='a')).toBe(true);
 });
 it('merges corrections in sequence and persists a dismissal',async()=>{
  mocks.jobs.mockResolvedValue([ready]);await store.getState().hydrate();
  store.getState().updateReview('job:0',{providerName:'B'});store.getState().updateReview('job:0',{notes:'Reviewed'});
  await store.getState().flushReviews();
  expect(mocks.patch.mock.calls).toEqual([['job',0,{providerName:'B'}],['job',0,{notes:'Reviewed'}]]);
  mocks.jobs.mockResolvedValue([{...ready,review:{0:{_dismissed:true}}}]);await store.getState().removeItem('job:0');
  expect(store.getState().queue).toEqual([]);
 });
 it('finishes a pending upload without starting extraction or uploading again',async()=>{
  mocks.jobs.mockResolvedValue([{...ready,status:'uploading'}]);await store.getState().hydrate();await store.getState().retryItem('job');
  expect(mocks.request).toHaveBeenCalledWith('complete',{jobId:'job'});expect(mocks.upload).not.toHaveBeenCalled();
 });
 it('keeps successful uploads visible without starting the worker, and lists failed filenames',async()=>{
  mocks.jobs.mockResolvedValue([{...ready,status:'uploaded'}]);
  mocks.upload.mockResolvedValueOnce('job').mockRejectedValueOnce(new Error('Network failed'));
  await store.getState().addFiles([new File(['a'],'a.png'),new File(['b'],'b.png')]);
  expect(store.getState().queue[0].status).toBe('uploaded');
  expect(store.getState().isProcessing).toBe(false);expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.wake).not.toHaveBeenCalled();
  expect(store.getState().uploadErrors).toEqual([{name:'b.png',message:'Network failed'}]);
  store.getState().reset();await store.getState().hydrate();
  expect(store.getState().queue[0].status).toBe('uploaded');expect(store.getState().isProcessing).toBe(false);
 });
 it('confirms only uploaded jobs once and blocks double clicks and new uploads during confirmation',async()=>{
  mocks.jobs.mockResolvedValue([{...ready,status:'uploaded'}, {...ready,id:'already-queued',status:'queued'}]);await store.getState().hydrate();
  let release:any;mocks.request.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const pending=store.getState().startUploaded();
  expect(await store.getState().startUploaded()).toBe(false);
  expect(await store.getState().addFiles([new File(['a'],'a.png')])).toBe(0);
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith('start',{companyId:'a',jobIds:['job']});
  mocks.jobs.mockResolvedValue([{...ready,status:'queued'}]);release({started:1});expect(await pending).toBe(true);
  expect(mocks.wake).toHaveBeenCalledTimes(1);
  expect(store.getState().queue[0].status).toBe('waiting');expect(store.getState().isStarting).toBe(false);
 });
 it('never confirms files while their upload is in progress and retains them after a failed confirmation',async()=>{
  mocks.jobs.mockResolvedValue([{...ready,status:'uploaded'}]);await store.getState().hydrate();
  store.setState({uploadProgress:{done:0,total:1}});expect(await store.getState().startUploaded()).toBe(false);
  expect(mocks.request).not.toHaveBeenCalled();store.setState({uploadProgress:null});
  mocks.request.mockRejectedValueOnce(new Error('Offline'));expect(await store.getState().startUploaded()).toBe(false);
  expect(store.getState().queue[0].status).toBe('uploaded');expect(store.getState().error).toBe('Offline');
 });
 it('does not hydrate or change the new company when an old confirmation finishes',async()=>{
  mocks.jobs.mockResolvedValue([{...ready,status:'uploaded'}]);await store.getState().hydrate();
  let release:any;mocks.request.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const pending=store.getState().startUploaded();setActiveOrganization(company('b'));store.getState().reset();release({started:1});
  expect(await pending).toBe(false);expect(store.getState().queue).toEqual([]);expect(mocks.jobs).toHaveBeenCalledTimes(1);
 });
 it('unlocks completed uploads while the background refresh is slow',async()=>{
  let release:any;mocks.jobs.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  expect(await store.getState().addFiles([new File(['a'],'a.png')])).toBe(1);
  expect(store.getState().uploadProgress).toBeNull();
  expect(store.getState().queue[0].status).toBe('uploaded');
  release([{...ready,id:'new',status:'uploaded'}]);await Promise.resolve();
 });
 it('shows accepted extraction immediately and ignores a stale poll',async()=>{
  mocks.jobs.mockResolvedValue([{...ready,status:'uploaded'}]);await store.getState().hydrate();
  let stale:any,latest:any;
  mocks.jobs.mockImplementationOnce(()=>new Promise(resolve=>{stale=resolve;}))
   .mockImplementationOnce(()=>new Promise(resolve=>{latest=resolve;}));
  const oldPoll=store.getState().hydrate();
  expect(await store.getState().startUploaded()).toBe(true);
  expect(store.getState().isStarting).toBe(false);expect(store.getState().queue[0].status).toBe('waiting');
  stale([{...ready,status:'uploaded'}]);await oldPoll;
  expect(store.getState().queue[0].status).toBe('waiting');
  latest([{...ready,status:'processing'}]);await Promise.resolve();
 });
 it('keeps confirmation errors visible across polling and clears them on a successful retry',async()=>{
  mocks.jobs.mockResolvedValue([{...ready,status:'uploaded'}]);await store.getState().hydrate();
  mocks.request.mockRejectedValueOnce(new Error('Offline'));
  expect(await store.getState().startUploaded()).toBe(false);
  await store.getState().hydrate();
  expect(store.getState().startError).toBe('Offline');expect(store.getState().isStarting).toBe(false);
  expect(await store.getState().startUploaded()).toBe(true);expect(store.getState().startError).toBeNull();
 });
});


describe('review preview loading',()=>{
 beforeEach(()=>{
  vi.stubGlobal('Image',class {src='';async decode(){}});
  vi.spyOn(URL,'createObjectURL').mockImplementation(()=> 'blob:preview-'+Math.random());
  vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  mocks.preview.mockResolvedValue(new Blob(['preview']));
 });
 afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
 const seed=async(count=6)=>{mocks.jobs.mockResolvedValue(Array.from({length:count},(_,index)=>({...ready,id:'job'+index})));await store.getState().hydrate();};
 it('deduplicates detailed downloads without replacing the small preview',async()=>{
  await seed(1);const small=await store.getState().ensurePreview('job0');
  const [a,b]=await Promise.all([store.getState().ensureDetailPreview('job0'),store.getState().ensureDetailPreview('job0')]);
  expect(a).toBe(b);expect(a).not.toBe(small);
  expect(store.getState().getReadyDetailPreview('job0')).toBe(a);
  expect(store.getState().isPreviewDecoded('job0',a!)).toBe(true);
  expect(store.getState().isPreviewDecoded('job0','blob:unknown')).toBe(false);
  expect(mocks.preview).toHaveBeenCalledTimes(2);expect(mocks.preview).toHaveBeenLastCalledWith('job0','detail');
  expect(store.getState().queue[0].tempPreviewUrl).toBe(small);
  expect(await store.getState().ensureDetailPreview('job0')).toBe(a);
  store.getState().reset();expect(URL.revokeObjectURL).toHaveBeenCalledWith(a);
  expect(store.getState().getReadyDetailPreview('job0')).toBeNull();
 });
 it('does not revoke an open image when background detail requests fill the cache',async()=>{
  await seed(6);const release=store.getState().pinDetailPreview('job0');
  const visible=await store.getState().ensureDetailPreview('job0');
  for(let i=1;i<6;i++)await store.getState().ensureDetailPreview('job'+i);
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(visible);
  expect(await store.getState().ensureDetailPreview('job0')).toBe(visible);release();
 });
 it('discards a detailed response after switching company',async()=>{
  await seed(1);let release:any;
  mocks.preview.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const pending=store.getState().ensureDetailPreview('job0');store.getState().reset();
  release(new Blob(['detail']));expect(await pending).toBeNull();expect(URL.revokeObjectURL).toHaveBeenCalled();
 });
 it('prepares the next four photos with at most two background requests',async()=>{
  await seed();
  let inFlight=0,max=0;
  mocks.preview.mockImplementation(async()=>{inFlight++;max=Math.max(max,inFlight);await Promise.resolve();inFlight--;return new Blob(['preview']);});
  await store.getState().prefetchPreviews(['job1','job2','job3','job4','job1']);
  expect(max).toBe(2);expect(mocks.preview).toHaveBeenCalledTimes(4);
  await store.getState().ensurePreview('job1');
  expect(mocks.preview).toHaveBeenCalledTimes(4);
 });
 it('drops obsolete prefetches after navigation and never downloads a full-size fallback',async()=>{
  await seed();const releases:Array<(value:Blob)=>void>=[];
  mocks.preview.mockImplementation(()=>new Promise(resolve=>{releases.push(resolve);}));
  const pending=store.getState().prefetchPreviews(['job1','job2','job3']);
  await store.getState().prefetchPreviews([]);releases.forEach(release=>release(new Blob(['preview'])));await pending;
  expect(mocks.preview).toHaveBeenCalledTimes(2);
  mocks.preview.mockRejectedValue(new Error('offline'));
  await expect(store.getState().ensurePreview('job3')).rejects.toThrow('offline');
  expect(store.getState().queue.find((item:any)=>item.jobId==='job3')?.tempPreviewUrl).toBeNull();
 });
 it('does not let an old response erase the new company request',async()=>{
  await seed(1);const releases:Array<(value:Blob)=>void>=[];
  mocks.preview.mockImplementation(()=>new Promise(resolve=>{releases.push(resolve);}));
  const old=store.getState().ensurePreview('job0');store.getState().reset();await seed(1);
  const next=store.getState().ensurePreview('job0');releases[0](new Blob(['old']));expect(await old).toBeNull();
  const duplicate=store.getState().ensurePreview('job0');expect(mocks.preview).toHaveBeenCalledTimes(2);
  releases[1](new Blob(['new']));expect(await duplicate).toBe(await next);
 });
 it('shows the active original when preview generation fails, including an in-flight prefetch',async()=>{
  await seed(1);let reject:any;
  mocks.preview.mockImplementation(()=>new Promise((_resolve,rejectPromise)=>{reject=rejectPromise;}));
  const prefetch=store.getState().prefetchPreviews(['job0']);
  const active=store.getState().ensureReviewPreview('job0');
  reject(new Error('preview server failed'));await prefetch;
  expect(await active).toBe('https://example.test/preview');
  expect(store.getState().queue[0].tempPreviewUrl).toBe('https://example.test/preview');
  expect(mocks.preview).toHaveBeenCalledTimes(1);
 });
});
