# QuickNotes Data Model

The model has four entities: **users**, **notes**, **tags** and **note_tags**. The SQL below is written for SQLite so it can be run in a playground such as sqliteonline.com. In PostgreSQL I would use `BIGSERIAL` for ids and `TIMESTAMPTZ` for dates.

## Entities and columns

### users
| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | **Primary key** |
| email | TEXT | NOT NULL, UNIQUE |
| password_hash | TEXT | NOT NULL (never store the plain password) |
| display_name | TEXT | NOT NULL |
| created_at | TIMESTAMP | NOT NULL, defaults to the current time |

### notes
| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | **Primary key** |
| user_id | INTEGER | NOT NULL, **foreign key** to users(id) |
| title | VARCHAR(100) | NOT NULL, 1 to 100 characters |
| body | TEXT | optional |
| created_at | TIMESTAMP | NOT NULL, defaults to the current time |
| updated_at | TIMESTAMP | NOT NULL, defaults to the current time |

### tags
| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | **Primary key** |
| user_id | INTEGER | NOT NULL, **foreign key** to users(id) |
| name | VARCHAR(50) | NOT NULL, unique for each user |

### note_tags (join table)
| Column | Type | Constraints |
|---|---|---|
| note_id | INTEGER | **Foreign key** to notes(id), part of the primary key |
| tag_id | INTEGER | **Foreign key** to tags(id), part of the primary key |

The primary key of `note_tags` is the pair `(note_id, tag_id)`, so the same tag cannot be attached to the same note twice.

## Relationships

- **users to notes: one-to-many.** One user writes many notes, and each note belongs to exactly one user (`notes.user_id`).
- **users to tags: one-to-many.** One user creates many tags, and each tag belongs to one user (`tags.user_id`).
- **notes to tags: many-to-many.** A note can have many tags (home, shopping) and a tag can be on many notes. A relational table cannot hold a list of ids in one column, so the join table `note_tags` stores one row for each note-and-tag pair. This turns the many-to-many relationship into two one-to-many relationships: notes to note_tags, and tags to note_tags.

## CREATE TABLE statements

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    title      VARCHAR(100) NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
    body       TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE tags (
    id      INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name    VARCHAR(50) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE (user_id, name)
);

CREATE TABLE note_tags (
    note_id INTEGER NOT NULL,
    tag_id  INTEGER NOT NULL,
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id)  REFERENCES tags (id)  ON DELETE CASCADE
);
```

`ON DELETE CASCADE` means that deleting a note also removes its rows in `note_tags`, and deleting a user removes that user's notes and tags, so no orphan rows are left behind.

## Example queries

Sample data used by the queries:

```sql
INSERT INTO users (id, email, password_hash, display_name) VALUES
    (1, 'amina@example.com', 'hash1', 'Amina'),
    (2, 'brian@example.com', 'hash2', 'Brian');

INSERT INTO notes (id, user_id, title, body) VALUES
    (1, 1, 'Buy milk',      'Two litres'),
    (2, 1, 'Project ideas', 'Notes app with tags'),
    (3, 2, 'Reading list',  NULL);

INSERT INTO tags (id, user_id, name) VALUES
    (1, 1, 'home'),
    (2, 1, 'work'),
    (3, 2, 'books');

INSERT INTO note_tags (note_id, tag_id) VALUES
    (1, 1),
    (2, 2),
    (3, 3);
```

**1. The latest 20 notes of one user** (this is what `GET /notes` runs):

```sql
SELECT id, title, created_at
FROM notes
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 20;
```

**2. All notes with a given tag, using JOINs** (this is what `GET /notes?tag=work` runs):

```sql
SELECT n.id, n.title, t.name AS tag
FROM notes n
JOIN note_tags nt ON nt.note_id = n.id
JOIN tags t       ON t.id = nt.tag_id
WHERE n.user_id = 1 AND t.name = 'work'
ORDER BY n.created_at DESC;
```

**3. How many notes each tag has, including tags with none** (LEFT JOIN with GROUP BY):

```sql
SELECT t.name, COUNT(nt.note_id) AS note_count
FROM tags t
LEFT JOIN note_tags nt ON nt.tag_id = t.id
WHERE t.user_id = 1
GROUP BY t.id, t.name;
```

**4. Update a note** (this is what `PUT /notes/{id}` runs):

```sql
UPDATE notes
SET title = 'Buy oat milk', updated_at = CURRENT_TIMESTAMP
WHERE id = 1 AND user_id = 1;
```

## Indexes

```sql
CREATE INDEX idx_notes_user_created ON notes (user_id, created_at DESC);
CREATE INDEX idx_note_tags_tag ON note_tags (tag_id);
```

- **`idx_notes_user_created`:** almost every request asks for one user's notes, newest first. With this index the database jumps straight to that user's rows already in date order. Without it, it must scan the whole `notes` table (millions of rows at our scale) and sort the matches on every request.
- **`idx_note_tags_tag`:** the primary key `(note_id, tag_id)` only helps lookups that start from a note. Filtering by tag starts from the tag, so this index avoids scanning the whole join table.

Indexes make reads faster but slow down writes a little and use extra storage, so I only add the ones that match real queries.

## SQL or NoSQL?

I would choose **SQL** (a relational database such as PostgreSQL). QuickNotes data is clearly structured and connected: users own notes, notes have tags, and tags are shared by many notes. A relational database enforces these links with foreign keys, keeps emails unique and removes related rows safely, so bad data is rejected by the database and not just by application code. Queries such as notes by tag and notes per tag are simple JOINs and GROUP BYs, and transactions let us save a note and its tags together or not at all. The expected load (about 12 writes per second on average for 1 million users, see the architecture document) is well within what one SQL primary can handle, with read replicas for the reads. A NoSQL document database would suit flexible, changing data or write volumes far beyond one server, but we do not need either, so SQL is the simpler and safer choice.
