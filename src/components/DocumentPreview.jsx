import { ZoomableImage } from "./ui/ImageViewer";
export default function DocumentPreview({
  src,
  mimeType,
  title = "Documento",
}) {
  if (mimeType === "application/pdf")
    return <iframe className="document-preview" src={src} title={title} />;
  if (/xml$/.test(mimeType || ""))
    return (
      <div className="card">
        <p>
          Original XML DTE. Revisa los datos extraídos junto a los totales del
          documento.
        </p>
        <a href={src} target="_blank" rel="noreferrer">
          Abrir XML original
        </a>
      </div>
    );
  return <ZoomableImage src={src} alt={title} />;
}
