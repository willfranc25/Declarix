import {describe,it,expect} from 'vitest';
import {civilDate,documentErrors,normalizeDocument,signedAmount,documentKey} from './documentRules';
import {reconcileRCV} from './reconciliation';
const valid={providerName:'Proveedor',providerRut:'76123456-0',documentType:'Factura',documentNumber:'1',date:'2026-01-01',expenseType:'Insumos',netAmount:1000,exemptAmount:200,ivaAmount:190,specificTax:10,otherTax:20,withholdingAmount:30,totalAmount:1390};
describe('document correctness',()=>{
 it('does not fabricate unknown dates or amounts',()=>{expect(normalizeDocument({})).toMatchObject({date:null,totalAmount:null,netAmount:null});});
 it('rejects impossible civil dates',()=>{expect(civilDate('2026-02-30')).toBeNull();expect(civilDate('2024-02-29')).toBeTruthy();});
 it('balances exempt amounts, taxes and retentions',()=>{expect(documentErrors(valid,'2026-09-24')).toEqual({});expect(documentErrors({...valid,otherTax:0},'2026-09-24').amounts).toBeTruthy();});
 it('subtracts credit notes without mutating original positive amounts',()=>{expect(signedAmount({...valid,documentType:'Nota de Crédito'},'totalAmount')).toBe(-1390);expect(valid.totalAmount).toBe(1390);});
 it('deduplicates by issuer, type and normalized folio',()=>{expect(documentKey(valid)).toBe(documentKey({...valid,providerRut:'76.123.456-0',documentNumber:'0001',documentType:'Factura Electrónica'}));expect(documentKey(valid)).not.toBe(documentKey({...valid,documentType:'Nota de Crédito'}));});
 it('uses 0000 for vouchers and separates different purchases without invented duplicates',()=>{
  const voucher={...valid,documentType:'Comprobante de pago electrónico',documentNumber:'0000',referenceNumber:'002211'};
  expect(normalizeDocument({...voucher,documentNumber:'155379'}).documentNumber).toBe('0000');
  expect(documentErrors(voucher,'2026-09-24')).toEqual({});
  expect(documentKey(voucher)).not.toBe(documentKey({...voucher,referenceNumber:'002212'}));
  expect(documentKey(voucher)).not.toBe(documentKey({...voucher,date:'2026-01-02'}));
  expect(documentKey({...voucher,referenceNumber:null})).toBeNull();
 });
 it('blocks bulk saving when independent folio readings disagree',()=>{
  const disputed={...valid,documentNumber:null,folioReview:{first:'3485367',second:'3485867',reason:'mismatch'}};
  expect(documentErrors(disputed,'2026-09-24').documentNumber).toMatch(/Confirma el folio/);
  expect(documentErrors({...disputed,documentNumber:'3485867',folioReview:null},'2026-09-24')).toEqual({});
 });
 it('compares RCV without silently importing or changing records',()=>{
  const result=reconcileRCV('RUT Proveedor;Tipo Doc;Folio;Monto Total\n76123456-0;33;1;1.390\n76123456-0;33;2;100',[valid]);
  expect(result.map(r=>r.status)).toEqual(['coincide','solo_rcv']);expect(valid.totalAmount).toBe(1390);
 });
});
