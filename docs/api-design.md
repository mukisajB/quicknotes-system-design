# QuickNotes API Design

This is the API the backend team should build for the real QuickNotes service. It is not the JSONPlaceholder practice API used by the browser client.

## Conventions

- **Base URL:** `https://api.quicknotes.example/v1`
- **Format:** every request and response body is JSON (`Content-Type: application/json`).
- **Resources are nouns in the plural:** `/notes`, `/tags`. The HTTP method says what to do with them.
- **Authentication:** every endpoint except register and login needs the header `Authorization: Bearer <token>`.
- **Privacy:** a user can only see and change their own notes and tags.
- **Pagination:** list endpoints take `page` (default 1) and `limit` (default 20, maximum 100).

## Endpoints

| Method | Path | Description | Success status |
|---|---|---|---|
| POST | `/auth/register` | Create a new user account. | 201 Created |
| POST | `/auth/login` | Exchange an email and password for an access token. | 200 OK |
| GET | `/notes` | List the current user's notes, newest first. Optional filter: `?tag=work`. | 200 OK |
| GET | `/notes/{id}` | Get one note by its id. | 200 OK |
| POST | `/notes` | Create a new note. | 201 Created |
| PUT | `/notes/{id}` | Replace a note's title, body and tags. | 200 OK |
| DELETE | `/notes/{id}` | Delete a note. | 204 No Content |
| GET | `/tags` | List the current user's tags. | 200 OK |

Notes on the choices:
- `POST /notes` returns `201` and a `Location: /v1/notes/{id}` header pointing at the new note.
- `DELETE` returns `204` with no body because there is nothing left to send back.
- `PUT` replaces the whole note, so the client sends the complete note. Calling it twice with the same data gives the same result (it is idempotent).

## Examples

### Create a note: `POST /notes`

Request:

```json
{
  "title": "Buy milk",
  "body": "Two litres, semi-skimmed.",
  "tags": ["home", "shopping"]
}
```

Response: `201 Created`

```json
{
  "id": 42,
  "title": "Buy milk",
  "body": "Two litres, semi-skimmed.",
  "tags": ["home", "shopping"],
  "created_at": "2026-11-05T09:30:00Z",
  "updated_at": "2026-11-05T09:30:00Z"
}
```

### List notes: `GET /notes?page=1&limit=2`

Response: `200 OK`

```json
{
  "data": [
    {
      "id": 42,
      "title": "Buy milk",
      "body": "Two litres, semi-skimmed.",
      "tags": ["home", "shopping"],
      "created_at": "2026-11-05T09:30:00Z",
      "updated_at": "2026-11-05T09:30:00Z"
    },
    {
      "id": 41,
      "title": "Project ideas",
      "body": "Notes app with tags and search.",
      "tags": ["work"],
      "created_at": "2026-11-04T16:05:00Z",
      "updated_at": "2026-11-04T16:20:00Z"
    }
  ],
  "page": 1,
  "limit": 2,
  "total": 37
}
```

An empty list is not an error. A user with no notes gets `200 OK` with `"data": []` and `"total": 0`.

## Error codes

Every error uses the same body shape, so clients can handle them in one place:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "The title is required.",
    "details": [{ "field": "title", "problem": "required" }]
  }
}
```

| Status | Meaning | Example of when it happens | Example error body |
|---|---|---|---|
| 400 Bad Request | The request is malformed or fails validation. | `POST /notes` with no title, or a title longer than 100 characters. | `{"error": {"code": "validation_failed", "message": "The title must be 1 to 100 characters.", "details": [{"field": "title", "problem": "too_long"}]}}` |
| 401 Unauthorized | The user is not authenticated. | Any `/notes` request with a missing, invalid or expired token. | `{"error": {"code": "unauthenticated", "message": "Your session has expired. Please log in again."}}` |
| 403 Forbidden | The user is logged in but not allowed to do this. | `PUT /notes/17` where note 17 exists but belongs to another user. | `{"error": {"code": "forbidden", "message": "You do not have permission to change this note."}}` |
| 404 Not Found | The resource does not exist. | `GET /notes/99999` when no note has that id. | `{"error": {"code": "not_found", "message": "Note 99999 was not found."}}` |
| 500 Internal Server Error | Something failed on the server. | The database is unreachable while saving a note. | `{"error": {"code": "internal_error", "message": "Something went wrong on our side. Please try again later."}}` |

Two more codes the API can also return:
- **409 Conflict:** `POST /auth/register` with an email that is already registered.
- **429 Too Many Requests:** a client sends far more requests than the rate limit allows.

Security note: answering `403` for another user's note tells the caller that the note exists. A stricter design would answer `404` in that case. QuickNotes uses `403` because note ids are not secret and it gives clearer error messages.
