# File storage

Uploads: profile photos and resumes. Photographs are served to whoever may see a
profile; documents are served **only** through an authorized request.

API: [`/api/files`](../api/README.md#files--apifiles) ·
[`/api/profiles/me/resume`](../api/profiles.md) · schema:
[database.md](database.md#stored_files)

---

## Layout

```
server/uploads/
  photos/      profile pictures
  documents/   resumes and other attached files
```

The root is `LOCAL_UPLOAD_DIR`, defaulting to `server/uploads`. It is **not**
mounted as static content: there is no route that serves a path, so every read
goes through a handler that checks who is asking. A directory served by nginx or
`express.static` would publish every resume in the system.

| Variable | Default | Purpose |
| --- | --- | --- |
| `LOCAL_UPLOAD_DIR` | `server/uploads` | Root of both scopes |
| `UPLOAD_MAX_BYTES` | `5242880` (5 MB) | Document ceiling |
| `STORAGE_DRIVER` | `local` | `local`; `s3` is the interface, not yet implemented |

Photographs have their own, smaller ceiling (`PHOTO_MAX_BYTES`, 2 MB) so an image
cannot consume the document allowance.

---

## Upload path

`storageService.validateDocumentUpload` accepts a file only when all of the
following hold:

1. It is within the size ceiling (`413` past it).
2. Its **magic bytes** agree with the declared content type. The client's
   `Content-Type` is never trusted on its own.
3. Its extension is one the detected type is allowed to use.
4. The declared MIME type is an accepted document type.
5. The bytes really are that document type.

| Type | Extension |
| --- | --- |
| `application/pdf` | `.pdf` |
| `application/msword` | `.doc` |
| `…wordprocessingml.document` | `.docx` |

DOCX is a zip archive, so a zip is accepted as a resume only when it actually
contains `word/document.xml`. A spreadsheet or an archive renamed to `.docx` is
refused, which is the whole point of checking the bytes rather than the name.

---

## What is stored, and under what name

- **The stored filename is generated** — a timestamp, a random suffix and an
  extension derived from the *detected* type. A hostile `originalname` never
  reaches the filesystem, so `../../etc/passwd` is not a path this code can
  construct, and a script cannot be stored under a web-servable extension.
- **The client's name is kept as metadata**, in `stored_files.original_filename`,
  and is what the download is named. It is reduced to a base name, stripped of
  control characters and quotes so it is safe in a `Content-Disposition` header
  and in a log line, and capped at 255 characters.
- Multipart filenames arrive as bytes that were read as latin1, which turns
  `résumé.pdf` into `rÃ©sumÃ©.pdf`. The name is reinterpreted as UTF-8 on the way
  in, so it reads back the way it was typed.
- The **checksum** (SHA-256) and the byte size are stored alongside.

---

## Reading a document

`GET /api/files/:fileId/download` authorises per request. A caller may read a
document when:

- they uploaded it, **or**
- they are an `ADMIN`, **or**
- they are the poster of a posting that an application has attached it to.

Anything else is `404`, not `403` — the answer should not confirm that somebody
else's resume exists.

Moderation is not one of those powers. A moderator reading a posting does not
consequently gain the right to read every resume in the system.

Two details of the download response:

- `Content-Disposition: attachment`. Always an attachment, never inline: a stored
  document rendered in a browser context is a stored-XSS risk even when it is
  "only" a PDF.
- Both filename forms are sent: an ASCII `filename=` for old clients, which drops
  what it cannot carry, and RFC 5987 `filename*=UTF-8''…` for the real name.

The checksum is **re-verified on the way out**. A file changed on disk after it
was written is caught and reported as `500` rather than served. Storage is
untrusted on read for the same reason the upload was validated on write.

---

## Attaching a document

Uploading a file is not the same as handing it to a recruiter. Attaching one to
an application requires `owner_id` to be the applicant:

```
422  You can only attach a file that you uploaded
```

This check is deliberately stricter than the read check. Read access extends to
the poster of the posting precisely so a recruiter can open what was submitted to
them; attach access does not, or one member could put another member's resume on
their own application.

---

## Deleting

`DELETE /api/files/:fileId` removes the row and the bytes. Only the owner or an
`ADMIN` may delete, and a file an application or a profile still points at is
`409` — the reference has to be removed first, so a posting cannot end up citing
a resume that no longer exists.

Deleting a **profile** resume replaces it: the previous bytes are reclaimed in the
same statement that stores the new file id, so replacing a resume does not leave
the old one behind.

---

## Ordering

The bytes are written before the row is inserted, and the row is what callers
trust: a storage failure must never leave a row promising a file nobody can read.
If the insert fails, the bytes are removed by hand — a database rollback cannot
unwrite a file, because the two halves are different systems and there is no
transaction spanning them.

---

## Testing

Tests set `LOCAL_UPLOAD_DIR` to a fresh `mkdtemp` directory before anything
imports the config, and remove it afterwards, so a test run never writes into the
repository and never reads a file left by an earlier run.
