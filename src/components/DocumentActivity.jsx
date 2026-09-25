import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";
export default function DocumentActivity({ invoice }) {
  const [comments, setComments] = useState([]),
    [audit, setAudit] = useState([]),
    [body, setBody] = useState(""),
    [error, setError] = useState("");
  const load = async () => {
    const [c, a] = await Promise.all([
      supabase
        .from("document_comments")
        .select("*")
        .eq("invoice_id", invoice.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("invoice_audit")
        .select("id,operation,created_at,before_data,after_data")
        .eq("invoice_id", invoice.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (c.error || a.error) throw new Error("No se pudo cargar la actividad.");
    setComments(c.data);
    setAudit(a.data);
  };
  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [invoice.id, invoice.updatedAt]);
  return (
    <div className="card space-y-4">
      <h2>Comentarios y trazabilidad</h2>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const { error: err } = await supabase
            .from("document_comments")
            .insert({
              organization_id: invoice.organization_id,
              invoice_id: invoice.id,
              body: body.trim(),
            });
          if (err) setError(err.message);
          else {
            setBody("");
            await load();
          }
        }}
      >
        <label>
          Nota de revisión
          <textarea
            className="form-input"
            required
            minLength={1}
            maxLength={2000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <button className="btn btn-secondary" disabled={!body.trim()}>
          Agregar comentario
        </button>
      </form>
      <ul className="usage-list">
        {comments.map((c) => (
          <li key={c.id}>
            {c.body}
            <br />
            <small>{new Date(c.created_at).toLocaleString("es-CL")}</small>
          </li>
        ))}
      </ul>
      <details>
        <summary>Historial de cambios ({audit.length})</summary>
        <ul className="usage-list">
          {audit.map((a) => {
            const changed = Object.keys(a.after_data || {}).filter(
              (k) =>
                !["updatedAt", "version", "extracted_original"].includes(k) &&
                JSON.stringify(a.before_data?.[k]) !==
                  JSON.stringify(a.after_data?.[k]),
            );
            return (
              <li key={a.id}>
                <strong>
                  {a.operation === "INSERT"
                    ? "Creación"
                    : a.operation === "DELETE"
                      ? "Eliminación"
                      : "Actualización"}
                </strong>{" "}
                · {new Date(a.created_at).toLocaleString("es-CL")}
                <p>Campos: {changed.join(", ") || "—"}</p>
              </li>
            );
          })}
        </ul>
      </details>
      {invoice.extracted_original && (
        <details>
          <summary>Extracción original (antes de las correcciones)</summary>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {JSON.stringify(invoice.extracted_original, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
