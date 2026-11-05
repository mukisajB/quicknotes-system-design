// QuickNotes API client.
// Talks to the JSONPlaceholder practice API: https://jsonplaceholder.typicode.com
// Rule used everywhere: user text is inserted with textContent, never innerHTML.

const API_URL = "https://jsonplaceholder.typicode.com/posts";
const NOTE_LIMIT = 10;

const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const notesList = document.getElementById("notes-list");

// The notes currently shown on the page, newest first.
// "key" is a number that is unique on this page. We need it because the
// server's "id" is not unique for notes we create (see the DELETE section).
let notes = [];
let nextKey = 1;
let busy = false;

// ---------- Shared helpers ----------

// One reusable function for every request. It calls fetch, checks
// response.ok and throws an error (with the status code) when it is false.
async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  return { data, status: response.status };
}

// Turns an error into a message a normal person can understand.
function friendlyError(error, action) {
  if (error.status) {
    return `Could not ${action}. The server answered with status ${error.status}. Please try again.`;
  }
  return `Could not ${action}. Check your internet connection and try again.`;
}

// type is "loading", "success" or "error"; each has its own style in style.css.
function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type ? `status ${type}` : "status";
}

// Disables every button while a request is running.
function setBusy(value) {
  busy = value;
  loadBtn.disabled = value;
}

// Draws the whole list. Shows the empty state when there are no notes.
function renderNotes() {
  notesList.replaceChildren();

  if (notes.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No notes to show yet. Press the Load notes button to get started.";
    notesList.appendChild(empty);
    return;
  }

  for (const note of notes) {
    const item = document.createElement("li");
    item.className = "note";

    const title = document.createElement("h3");
    title.textContent = note.title;

    const body = document.createElement("p");
    body.textContent = note.body || "(no body)";

    item.append(title, body);

    notesList.appendChild(item);
  }
}

// ---------- GET: load notes ----------

async function getNotes() {
  const { data } = await request(`${API_URL}?_limit=${NOTE_LIMIT}`);
  return data;
}

async function handleLoad() {
  setBusy(true);
  setStatus("Loading notes...", "loading");
  try {
    const data = await getNotes();
    notes = data.map((note) => ({
      key: nextKey++,
      id: note.id,
      title: note.title,
      body: note.body,
      isLocal: false,
    }));
    renderNotes();
    if (notes.length === 0) {
      setStatus("The server has no notes to show.", "success");
    } else {
      setStatus(`Loaded ${notes.length} notes from the server.`, "success");
    }
  } catch (error) {
    setStatus(friendlyError(error, "load the notes"), "error");
  } finally {
    setBusy(false);
  }
}

// ---------- Start-up ----------

loadBtn.addEventListener("click", handleLoad);
renderNotes(); // shows the empty state before anything is loaded
