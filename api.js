// QuickNotes API client.
// Talks to the JSONPlaceholder practice API: https://jsonplaceholder.typicode.com
// Rule used everywhere: user text is inserted with textContent, never innerHTML.

const API_URL = "https://jsonplaceholder.typicode.com/posts";
const NOTE_LIMIT = 10;
const MAX_TITLE_LENGTH = 100;

const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const notesList = document.getElementById("notes-list");
const noteForm = document.getElementById("note-form");
const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const submitBtn = document.getElementById("submit-btn");

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
  submitBtn.disabled = value;
  document.querySelectorAll(".delete-btn").forEach((button) => {
    button.disabled = value;
  });
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

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.disabled = busy;
    deleteBtn.setAttribute("aria-label", `Delete note: ${note.title}`);
    deleteBtn.addEventListener("click", () => handleDelete(note));
    item.appendChild(deleteBtn);

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

// ---------- POST: create a note ----------

// Returns an error message, or null when the title is fine.
function validateTitle(title) {
  if (title.length === 0) {
    return "Please enter a title for your note.";
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return `The title is too long (${title.length} characters). Use at most ${MAX_TITLE_LENGTH}.`;
  }
  return null;
}

async function createNote(note) {
  return request(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(note),
  });
}

async function handleSubmit(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim(); // the body is optional

  const problem = validateTitle(title);
  if (problem) {
    setStatus(problem, "error");
    titleInput.setAttribute("aria-invalid", "true");
    titleInput.focus();
    return;
  }
  titleInput.removeAttribute("aria-invalid");

  setBusy(true);
  setStatus("Creating note...", "loading");
  try {
    const { data, status } = await createNote({ title, body, userId: 1 });
    // Put the note the server sent back at the top of the list.
    notes.unshift({
      key: nextKey++,
      id: data.id,
      title: data.title || title,
      body: data.body || body,
      isLocal: true,
    });
    renderNotes();
    noteForm.reset();
    setStatus(`Note created (status ${status}, id ${data.id}).`, "success");
  } catch (error) {
    setStatus(friendlyError(error, "create the note"), "error");
  } finally {
    setBusy(false);
  }
}

// ---------- DELETE: remove a note ----------

// How deleting works with JSONPlaceholder (it is a practice API):
//  - It pretends to accept changes but never saves them. A real
//    DELETE /posts/5 answers 200 OK, yet note 5 comes back on the next load.
//    So after a successful DELETE we remove the note from the page ourselves.
//  - A note we created with POST was never stored. The server always gives it
//    id 101, so every new note has the same id and DELETE /posts/101 would
//    not refer to a real note. For these notes we skip the request, remove
//    them locally and say so in the status message.
//  - Because of the duplicate ids we remove notes by our own unique "key",
//    never by "id". Otherwise deleting one new note would remove them all.
// With a real backend every note would have a real id, and every delete would
// simply be a DELETE request followed by removing the note from the list.
async function deleteNote(id) {
  return request(`${API_URL}/${id}`, { method: "DELETE" });
}

async function handleDelete(note) {
  setBusy(true);
  try {
    let message;
    if (note.isLocal) {
      message = "Note removed. It only existed on this page, so the server was not contacted.";
    } else {
      setStatus("Deleting note...", "loading");
      const { status } = await deleteNote(note.id);
      message = `Note ${note.id} deleted (status ${status}).`;
    }
    notes = notes.filter((item) => item.key !== note.key);
    renderNotes();
    setStatus(message, "success");
  } catch (error) {
    setStatus(friendlyError(error, "delete the note"), "error");
  } finally {
    setBusy(false);
  }
}

// ---------- Start-up ----------

loadBtn.addEventListener("click", handleLoad);
noteForm.addEventListener("submit", handleSubmit);
renderNotes(); // shows the empty state before anything is loaded
