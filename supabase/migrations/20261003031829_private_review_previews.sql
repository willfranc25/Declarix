-- Rebuildable JPEG previews. No client policy: only the server can read/write.
-- The API checks extraction_jobs ownership before returning even a cached image.
insert into storage.buckets(id, name, public, file_size_limit)
values ('document-previews', 'document-previews', false, 5242880)
on conflict (id) do nothing;
