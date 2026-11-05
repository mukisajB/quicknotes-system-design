# QuickNotes System Design

## Description

QuickNotes is a notes app that is moving from a browser-only tool to an online service for 1 million users. This repository has two parts:

1. **A small API client** (`index.html`, `api.js`, `style.css`) that proves the front end can talk to a REST API. It uses the [JSONPlaceholder](https://jsonplaceholder.typicode.com) practice API to load notes (GET), create notes (POST) and delete notes (DELETE). It shows loading, success, error and empty states, validates the title and uses `textContent` for all user text.
2. **Three design documents** for the backend team, in the `docs` folder: the REST API, the database model and the system architecture.

## How to run the API client

You need a web browser and an internet connection. There is nothing to install.

1. Download or clone this repository.
2. Open `index.html` in your browser (double-click it, or right-click and choose Open with, then your browser).
3. Click **Load notes** to fetch 10 notes from the server.
4. Fill in the form (a title is required, up to 100 characters) and click **Add note** to create a note.
5. Click **Delete** on a note to remove it.

If you use VS Code, you can also right-click `index.html` and choose **Open with Live Server** if you have that extension installed.

Note: JSONPlaceholder does not really save changes. A created note disappears on reload, and a deleted note comes back when you load again. The comments in `api.js` explain how the client handles this.

## Documents

- [API design](docs/api-design.md): the REST endpoints, JSON examples and error codes.
- [Data model](docs/data-model.md): tables, relationships, SQL, example queries, an index and the SQL or NoSQL decision.
- [Architecture](docs/architecture.md): requirements, load estimate, diagram, request flows, trade-offs and single points of failure.

## Project structure

```
quicknotes-system-design/
├── index.html
├── api.js
├── style.css
├── README.md
└── docs/
    ├── api-design.md
    ├── data-model.md
    └── architecture.md
```

## What I learned

- **Handling requests properly:** a reusable `request()` function that checks `response.ok` and throws errors keeps the code short, and `try` / `catch` / `finally` makes sure the buttons are enabled again even when a request fails.
- **Showing every state:** a good interface needs loading, success, error and empty states, not only the happy path, and validating input before sending avoids pointless requests.
- **Safe output:** inserting user text with `textContent` instead of `innerHTML` stops people injecting HTML or scripts into the page.
- **Practice APIs have limits:** JSONPlaceholder pretends to save data but does not, so the client had to handle created and deleted notes itself.
- **Designing an API:** REST uses plural nouns for resources and HTTP methods and status codes for actions and results, such as 201 for create and 204 for delete.
- **Modelling data:** a many-to-many relationship, such as notes and tags, needs a join table, and indexes should match the queries that are really run.
- **Scaling with numbers:** a rough estimate (about 116 reads and 12 writes per second on average) shows what to scale: a read-heavy service needs a cache and a read replica before it needs anything complicated.
