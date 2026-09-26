import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({load:vi.fn(),save:vi.fn(),saveWithImage:vi.fn(),saveImage:vi.fn(),update:vi.fn()}));
vi.mock('../services/storage/StorageProvider',()=>({getStorageProvider:()=>({initialize:async()=>{},getAll:mocks.load,save:mocks.save,saveWithImage:mocks.saveWithImage,saveImage:mocks.saveImage,update:mocks.update})}));
import store from '../store/invoiceStore';
import {setActiveOrganization} from '../services/organizationService';
const valid={providerName:'Proveedor',providerRut:'76123456-0',documentType:'Factura',documentNumber:'1',date:'2026-01-01',expenseType:'Insumos',netAmount:1000,ivaAmount:190,totalAmount:1190};
beforeEach(()=>{vi.clearAllMocks();store.getState().reset();setActiveOrganization({id:'a'});mocks.save.mockImplementation(async data=>({...data,id:'id',taxStatus:'reviewed'}));mocks.saveWithImage.mockImplementation(async data=>({...data,id:'image-id',taxStatus:'reviewed'}));});
describe('invoice store isolation and dates',()=>{
 it('validates before persistence',async()=>{await expect(store.getState().addInvoice({...valid,providerRut:'bad'})).rejects.toThrow('RUT');expect(mocks.save).not.toHaveBeenCalled();});
 it('saves reviewed data without uploading an original a second time',async()=>{const row=await store.getState().addInvoice(valid);expect(row.taxStatus).toBe('reviewed');expect(store.getState().invoices).toHaveLength(1);});
 it('does not put a late response into another workspace',async()=>{
  let release:any;mocks.load.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const pending=store.getState().loadInvoices();await Promise.resolve();setActiveOrganization({id:'b'});store.getState().reset();release([valid]);await pending;expect(store.getState().invoices).toEqual([]);
 });
 it('keeps first-of-month dates in the correct month in Chile',()=>{
  store.setState({invoices:[{...valid,date:'2026-01-01'},{...valid,date:'2025-12-31'}] as any});
  store.getState().setFilters({year:2026,month:1});expect(store.getState().getFilteredInvoices()).toHaveLength(1);
 });
 it('saves the original and invoice through one storage operation',async()=>{
  const file=new File(['x'],'test.png',{type:'image/png'});const row=await store.getState().addInvoice(valid,file);
  expect(mocks.saveWithImage).toHaveBeenCalledWith(valid,file);expect(mocks.save).not.toHaveBeenCalled();expect(row.id).toBe('image-id');
 });
});
