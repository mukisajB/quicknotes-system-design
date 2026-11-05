# QuickNotes Architecture

QuickNotes is moving from a browser-only app to an online service for **1 million users**. This document describes the requirements, the load we expect, the architecture, how requests flow through it and what we trade off.

## 1. Requirements

### Functional requirements
- Users can register and log in.
- Users can create, view, edit and delete their own notes.
- A note has a title (required, up to 100 characters) and an optional body.
- Users can tag notes and filter their notes by tag.
- Notes are private. A user can never see another user's notes.
- Notes are available from any device after logging in.

### Non-functional requirements
- **Availability:** 99.9% uptime, so no single failing machine may take the service down.
- **Performance:** listing notes answers in under 300 ms for 95% of requests.
- **Scalability:** supports 1 million users now and can grow by adding servers, not by rewriting.
- **Durability:** a saved note is never lost. The database is backed up and replicated.
- **Security:** all traffic uses HTTPS, passwords are stored only as hashes, and every request is authenticated.
- **Consistency:** after saving a note, the same user sees it straight away (read-your-own-writes). Short delays for other views are acceptable.

## 2. Load estimate for 1 million users

### Assumptions
- 1,000,000 registered users.
- 20% are active on a given day, so **200,000 daily active users**.
- Each active user makes 50 read requests per day (opening and refreshing the list, viewing notes).
- Each active user makes 5 write requests per day (create, edit or delete).
- An average note takes about 2 KB including its title, body, tag links and metadata.
- Peak traffic is 5 times the average.
- A day has 86,400 seconds.

### Results
| Quantity | Calculation | Average | Peak (5x) |
|---|---|---|---|
| Reads per second | 200,000 x 50 = 10,000,000 per day; divided by 86,400 | about **116 / s** | about **579 / s** |
| Writes per second | 200,000 x 5 = 1,000,000 per day; divided by 86,400 | about **12 / s** | about **58 / s** |
| Storage per year | 1,000,000 new notes per day x 2 KB = 2 GB per day; x 365 | about **730 GB** (about 1.1 TB with indexes) | |

What this tells us:
- QuickNotes is **read-heavy**: about 10 reads for every write.
- One primary database can easily handle 58 writes per second at peak, so we do not need to split (shard) the data yet.
- Reads are the part to scale, with a cache and a read replica. If 80% of reads are answered by the cache, the database sees only about 23 reads per second on average and about 116 at peak.
- About 1 TB of data per year is small for a SQL database, so storage is not a concern for several years.

## 3. Architecture diagram

DNS only turns the name into an address (it is not a server the data passes through), but it is drawn first because it is the first thing the client uses.

```
 Client (browser or mobile app)
    |
    v
 +-----+     +-----+     +---------------+
 | DNS | --> | CDN | --> | Load balancer |
 +-----+     +-----+     +---------------+
                                 |
                  +--------------+--------------+
                  |                             |
                  v                             v
          +--------------+              +--------------+
          | App server 1 |              | App server 2 |   (stateless, add more)
          +--------------+              +--------------+
                  |                             |
                  +--------------+--------------+
                                 |
          +----------------------+----------------------+
          |                      |                      |
          v                      v                      v
    +-----------+     +--------------------+      +-----------+
    |   Cache   |     |  Primary database  |      |   Queue   |
    |  (Redis)  |     |    (all writes)    |      +-----------+
    +-----------+     +--------------------+            |
                                |  replication          v
                                v                +-------------+
                      +--------------------+     |   Worker    |
                      |   Read replica     |     | (background |
                      | (cache-miss reads) |     |    jobs)    |
                      +--------------------+     +-------------+
```

## 4. What each component does

- **Client:** it solves the need for a simple interface by showing notes and sending requests to the API, so the user never touches the servers directly.
- **DNS:** it solves the problem of users having to remember an IP address by turning `api.quicknotes.example` into the address of our entry point, and it lets us move servers without changing the name.
- **CDN:** it solves slow page loads for faraway users by serving the static front-end files (HTML, CSS, JavaScript) from locations close to them, so app servers only handle API calls.
- **Load balancer:** it solves the single-server limit and single point of failure by spreading requests over several app servers and skipping any that fail a health check.
- **App servers (two or more):** they solve the need to run the business logic (login, validation, reading and writing notes) at scale, and because they keep no local state we can add more whenever traffic grows.
- **Cache (Redis):** it solves repeated database reads by keeping recently listed notes in fast memory, which keeps latency low and protects the database.
- **Primary database:** it solves the need for safe, consistent storage of users, notes and tags, and it is the only place that accepts writes.
- **Read replica:** it solves read overload on the primary by keeping a copy of the data that answers read queries, and it can take over if the primary fails.
- **Queue:** it solves slow requests and traffic spikes by holding background jobs (for example updating a search index or sending an email) so the user does not wait for them.
- **Worker:** it solves the need to do that slow work outside the request by taking jobs from the queue one at a time, and we can run more workers if the queue grows.

## 5. Request flows

### GET /notes (list the user's notes)
1. The client asks DNS for `api.quicknotes.example` and gets the address of the entry point.
2. The request goes through the CDN (which passes API calls straight on) to the **load balancer**.
3. The load balancer picks a healthy **app server**.
4. The app server checks the token. If it is missing or expired, it answers `401`.
5. The app server looks in the **cache** for the key `notes:user:{id}:page:1`.
6. **Cache hit:** it returns the stored list straight away.
7. **Cache miss:** it runs the query on the **read replica**, saves the result in the cache with a short expiry (for example 60 seconds), and continues.
8. The app server answers `200 OK` with the JSON list. An empty list is a normal `200`, not an error.

### POST /notes (create a note)
1. The request reaches an app server by the same route: DNS, CDN, load balancer.
2. The app server checks the token (`401` if invalid).
3. It validates the body. A missing title or a title over 100 characters gives `400`.
4. It saves the note and its tags in one transaction on the **primary database**. If the database fails, it answers `500` and nothing is saved.
5. It deletes the user's cached lists (`notes:user:{id}:*`), so the user's next list request reads fresh data. This gives read-your-own-writes.
6. It puts a "note created" job on the **queue**.
7. It answers `201 Created` with the new note and a `Location` header, without waiting for the job.
8. A **worker** later takes the job from the queue and does the background work (for example updating the search index). If the worker crashes, the job is not marked as done, so another worker picks it up.

## 6. Trade-offs

1. **Speed versus freshness (cache and read replica):** the cache and the replica make reads fast and cheap, but they can be slightly out of date. A replica may lag behind the primary by a moment, and a cached list can be up to 60 seconds old. We accept this for views of data that changed elsewhere, and we reduce the problem by clearing the writer's cache entries after each write and, if needed, reading a user's own just-written notes from the primary.
2. **Fast responses versus simplicity (queue):** the queue keeps `POST /notes` fast and absorbs spikes, but the background work happens a little later and we have one more component to run, monitor and retry. We accept this because users should never wait for slow tasks.
3. **Cost versus availability (redundancy):** running two or more app servers, a replica and a standby for each important part costs more than a single server. We accept the cost to meet the 99.9% availability goal, and the capacity we pay for also gives room for traffic peaks.
4. **Simplicity versus scale (one SQL primary):** one primary database is easy to reason about and gives strong consistency, but all writes go through one machine. At about 58 writes per second at peak this is comfortable. If writes grow a hundred times, we would add sharding or move to a distributed database.

## 7. Avoiding single points of failure

| Part | How it survives a failure |
|---|---|
| DNS | Use a managed DNS service that runs on many servers around the world. |
| CDN | It already runs many edge locations, so one failing location does not stop the others. |
| Load balancer | Use a managed load balancer or a pair (active and standby), so one failing does not stop traffic. |
| App servers | Run at least two in different data centres. The load balancer health checks remove a failed server. |
| Cache | Run it as a cluster with replicas. If it is down, the app servers read from the database (slower, but the service still works). |
| Primary database | Keep a synchronous or near-synchronous replica that can be promoted automatically if the primary fails, and take regular backups. |
| Read replica | Run two replicas, so reads continue if one fails. |
| Queue | Use a managed, replicated queue. Jobs are saved until a worker finishes them. |
| Worker | Run several workers, so another can take over a job if one crashes. |
