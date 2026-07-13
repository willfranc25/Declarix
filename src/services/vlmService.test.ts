import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del cliente Supabase (la sesión autentica la llamada al backend)
const mockGetSession = vi.fn();
vi.mock('./supabaseClient', () => ({
  supabase: { auth: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));

import { extractInvoiceData, validateExtractedData } from '../services/vlmService';

// RUT chileno con dígito verificador válido
const VALID_RUT = '12.345.678-5';

const validFactura = {
  providerName: 'Sodimac',
  providerRut: VALID_RUT,
  documentType: 'Factura',
  documentNumber: '12345',
  date: '2026-01-15',
  detail: 'Materiales',
  expenseType: 'Materiales de Construccion',
  netAmount: 1000,
  totalBoletaServicios: 0,
  totalBoletaHonorarios: 0,
  specificTax: 0,
  ivaAmount: 190,
  totalAmount: 1190,
};

function backendResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => ({ text: JSON.stringify(payload), requestId: 'req-1' }),
  };
}

function makeImageFile() {
  return new File([new Uint8Array([1, 2, 3])], 'boleta.jpg', { type: 'image/jpeg' });
}

describe('validateExtractedData', () => {
  it('acepta una factura consistente', () => {
    const result = validateExtractedData(validFactura);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rechaza RUT inválido', () => {
    const result = validateExtractedData({ ...validFactura, providerRut: '12.345.678-0' });
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toContain('RUT');
  });

  it('rechaza neto + IVA distinto del total en facturas', () => {
    const result = validateExtractedData({ ...validFactura, totalAmount: 2000 });
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toContain('inconsistente');
  });

  it('rechaza fechas futuras', () => {
    const result = validateExtractedData({ ...validFactura, date: '2099-01-01' });
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toContain('futura');
  });

  it('rechaza tipos de gasto fuera del catálogo', () => {
    const result = validateExtractedData({ ...validFactura, expenseType: 'Gasto Inventado' });
    expect(result.isValid).toBe(false);
  });

  it('exige total > 0 en boletas', () => {
    const result = validateExtractedData({
      ...validFactura,
      documentType: 'Boleta',
      netAmount: 0,
      ivaAmount: 0,
      totalBoletaServicios: 0,
    });
    expect(result.isValid).toBe(false);
  });
});

describe('extractInvoiceData — backend propio (único camino)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'jwt-token' } } });
  });

  it('llama a /api/extract con el token de sesión y devuelve datos validados', async () => {
    const fetchMock = vi.fn().mockResolvedValue(backendResponse(validFactura));
    vi.stubGlobal('fetch', fetchMock);

    const result = await extractInvoiceData(makeImageFile());

    expect(result.providerRut).toBe(VALID_RUT);
    expect(result.totalAmount).toBe(1190);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/extract');
    expect(init.headers.Authorization).toBe('Bearer jwt-token');
    const body = JSON.parse(init.body as string);
    expect(body.mimeType).toBe('image/jpeg');
    expect(typeof body.imageBase64).toBe('string');
    // Nunca llama directo a un proveedor externo desde el navegador
    expect(url).not.toContain('googleapis.com');
    expect(url).not.toContain('openai.com');
  });

  it('reintenta con feedback cuando la validación falla y termina con datos válidos', async () => {
    const invalid = { ...validFactura, providerRut: '11.111.111-0' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(backendResponse(invalid))
      .mockResolvedValueOnce(backendResponse(validFactura));
    vi.stubGlobal('fetch', fetchMock);

    const result = await extractInvoiceData(makeImageFile());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.providerRut).toBe(VALID_RUT);
    // El segundo intento envía el feedback del error anterior al backend
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondBody.feedback).toContain('RUT');
  });

  it('propaga de inmediato el error del backend (la cola decide reintentar)', async () => {
    // Errores de red/proveedor (rate limit, cuota) no se reintentan aquí:
    // se propagan para que la cola de subida espere y reintente sola. Así no
    // se queman llamadas a la IA por cada boleta que topa el límite.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Alcanzaste el límite mensual de extracciones con IA de tu plan.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(extractInvoiceData(makeImageFile())).rejects.toThrow(/límite mensual/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('NO descarta la boleta si el modelo no leyó el RUT: entrega datos parciales a Revisión', async () => {
    // Caso real: voucher Transbank arrugado donde la IA no logra leer el RUT.
    // Antes se lanzaba error y la boleta se perdía; ahora se entrega lo
    // extraído para corregir el RUT en la pantalla de Revisión.
    const sinRut = { ...validFactura, providerRut: null };
    const fetchMock = vi.fn().mockResolvedValue(backendResponse(sinRut));
    vi.stubGlobal('fetch', fetchMock);

    const result = await extractInvoiceData(makeImageFile());

    // Un intento + un reintento con feedback, luego se acepta lo parcial
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.providerRut).toBeNull();
    expect(result.providerName).toBe('Sodimac');
    expect(result.totalAmount).toBe(1190);
  });
});
