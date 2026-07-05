/**
 * Tipos de gasto (TIPO DE GASTO) para la planilla de rendición.
 * Corresponden a las categorías aceptadas en el formato de rendición
 * configurado por la empresa.
 */
export const EXPENSE_TYPES = [
  'Activo fijo',
  'Alarma y monitoreo',
  'Almuerzos y colaciones terreno',
  'Alojamiento',
  'Arriendo de equipos y maquinarias',
  'Arriendo de software contable',
  'Arriendo vehiculos',
  'Articulos de aseo y oficina',
  'Combustible',
  'Consumo celular',
  'Consumo de agua',
  'Consumo electrico',
  'Consumo gas',
  'Consumo telefono',
  'Correo Carrier',
  'Costo Articulos de Seguridad',
  'Costo Herramientas Menores electricas',
  'Costo Herramientas menores manuales',
  'Costo Insumos Electricos',
  'Costo Insumos Varios',
  'Costo Materiales Aceros',
  'Costo Materiales de Consumo Inmediato',
  'Costo Materiales Plasticos',
  'Estacionamiento',
  'Exámenes medicos y psicologicos',
  'Gastos de capacitacion',
  'Gastos legales y notariales',
  'Honorarios',
  'Honorarios Legales',
  'Honorarios Profesionales',
  'Imprenta',
  'INSUMOS DENTALES',
  'Insumos computacionales',
  'Locomocion peajes tag',
  'Mantencion camaras seguridad',
  'Mantencion Equipos computacionales',
  'Mantencion extintores',
  'Mantencion instalaciones',
  'Mantencion maquinarias y equipos',
  'Mantencion vehiculos',
  'Materiales de Construccion',
  'Otros beneficios del personal',
  'Pasajes aereos viajes',
  'Patente municipal',
  'Patente rev. Tecnica y permiso Circ.',
  'Publicidad y marketing',
  'Retiro de residuos/ sanitizacion',
  'Servicios aduaneros',
  'Servicios de asesoría y consultoría',
  'Servicios de matencion',
  'Servicios de transportes',
  'Servicios electricos',
  'Software y gastos de web',
  'Soporte informatico',
  'Suscripciones',
  'Uniformes corporativos',
  'Valijas y correspondencia',
];

/**
 * Tipos de documento aceptados en la rendición.
 */
export const DOCUMENT_TYPES = [
  'Factura',
  'Factura Electrónica',
  'Boleta',
  'Boleta Electrónica',
  'Boleta de Honorarios',
  'Nota de Crédito',
  'Otro',
];

/**
 * Estados de un comprobante en el flujo de trabajo.
 */
export const INVOICE_STATUSES = ['pending', 'reviewed', 'approved'];

/**
 * Labels en español para cada estado.
 */
export const STATUS_LABELS = {
  pending: 'Pendiente',
  reviewed: 'Revisado',
  approved: 'Aprobado',
};
