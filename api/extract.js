// Retire the synchronous endpoint so it cannot bypass credit reservation.
export default function handler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  return res
    .status(410)
    .json({
      error: "Actualiza Declarix y usa la carga de documentos de tu empresa.",
    });
}
