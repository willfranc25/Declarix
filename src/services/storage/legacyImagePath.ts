/** Find an original image stored before uploads moved to the durable job queue. */
type LegacyStorage = {
  from: (bucket: "images") => {
    list: (
      path: string,
      options: { search: string },
    ) => Promise<{ data: { name: string }[] | null; error: Error | null }>;
  };
};

export async function findLegacyImagePath(
  storage: LegacyStorage,
  userId: string,
  invoiceId: string,
): Promise<string | null> {
  const bucket = storage.from("images");
  const owned = await bucket.list(userId, { search: invoiceId });
  if (owned.error) throw owned.error;
  const ownedMatch = (owned.data || []).find((file) =>
    file.name.startsWith(invoiceId + "."),
  );
  if (ownedMatch) return userId + "/" + ownedMatch.name;

  // A small number of pre-RLS uploads were stored at the bucket root.
  const root = await bucket.list("", { search: invoiceId });
  if (root.error) throw root.error;
  return (
    (root.data || []).find((file) => file.name.startsWith(invoiceId + "."))
      ?.name || null
  );
}
