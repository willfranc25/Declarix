import { validateRut } from "../src/utils/rutValidator.js";
import { applyFocusedReading, reconcileFolioReading, supportedFolio, unverifiedFolio } from "./focusedReading.js";

const comparable = value => String(value || "").replace(/^0+(?=\d)/, "");
const taxDocument = doc => /^(?:boleta|factura|nota de)/i.test(doc.documentType || "");
export const needsIdentifierReading = doc => !validateRut(doc.providerRut || "") ||
  !doc.documentNumber || !!doc.folioReview || (taxDocument(doc) && !!doc.documentNumber);

// At most one additional close-up reading, only when the first verification
// cannot resolve the identifiers. Never guess a check digit or pick a majority
// without a printed tax label. The model never sees previous candidate values.
export async function readIdentifiers(document, read, canRetry = () => true) {
  const seed = { ...document, documentNumber: document.documentNumber || document.folioReview?.first || null };
  let next = seed;
  const readings = [];
  try {
    const first = await read(false);
    readings.push(first);
    next = taxDocument(seed) && seed.documentNumber
      ? reconcileFolioReading(seed, first) : applyFocusedReading(seed, first);
    if ((!validateRut(next.providerRut || "") || !next.documentNumber || next.folioReview) && canRetry()) {
      const second = await read(true);
      readings.push(second);
      const corrected = applyFocusedReading(next, second);
      if (next.folioReview) corrected.documentNumber = null;
      if (next.folioReview && supportedFolio(second?.documentNumber, second?.folioEvidence)) {
        const number = second.documentNumber.trim();
        const previous = supportedFolio(first?.documentNumber, first?.folioEvidence) ? first.documentNumber : null;
        if (comparable(number) === comparable(seed.documentNumber) ||
            (previous && comparable(number) === comparable(previous))) {
          corrected.documentNumber = comparable(number) === comparable(seed.documentNumber) ? seed.documentNumber : number;
          corrected.folioReview = null;
        }
      }
      next = corrected;
    }
  } catch {
    if (!readings.length) next = unverifiedFolio(document);
    // A provider failure during the extra reading cannot discard earlier results.
  }
  return { document: next, readings };
}
