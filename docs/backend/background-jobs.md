# Background jobs

Some work cannot happen inside a request. Somebody has to be reminded about an
event tomorrow, and an event whose day has passed has to be closed off whether or
not anybody is looking at it. This is where that work lives.

## Two ideas, kept apart

The scheduler decides **when** a job runs and **proves it ran once**. A service
decides **what** the job does. Nothing else knows about timers.

That separation is what makes the work testable: a test calls
`eventService.runEventSweeps()` directly, gets the same effect in one call, and
does not wait for an interval or a claim. The scheduler is the part that has to be
right about concurrency, so it is the part that has the smallest surface.

```
server.js ──► startScheduler() ──► every 15 min ──► runAllJobs()
                                                        │
                                              reapStaleRunsJob()
                                              runEventSweepsJob()
                                                        │
                                              runJob() ──► claimRun()  (once per key)
                                                        │
                                              eventService.runEventSweeps()
```

## The ledger

`background_jobs` is the record of every run. `run_key` is the primary key, which
is the whole idempotency mechanism: claiming a key is an insert, and an insert
that loses a race is a no-op rather than a second run.

| Column | Holds |
| --- | --- |
| `run_key` | `job-name:window`, e.g. `event-sweeps:2026-02-14` |
| `job_name` | `event-sweeps` |
| `status` | `running`, `succeeded`, `failed` |
| `attempts` | Incremented each time a run is taken over |
| `result` | What the job returned, as JSON |
| `error` | The message, when it failed |
| `started_at`, `finished_at` | For staleness and for the health endpoint |

The run key carries the day, so each day gets one run of its own. A server that
restarts in the middle of the afternoon does not skip the evening's reminders,
because the evening's run key has not been claimed yet.

A scheduler that reused the time it started would keep claiming today's key every
fifteen minutes until tomorrow, and tomorrow's reminders would never be sent. The
interval callback reads the clock on every pass; the injected `now` is only for the
first pass and for tests.

## Staleness

A process can die holding a claim. Without help, that key is never run again — the
run key has done its job by refusing the second run, including the one that should
have happened.

So a run older than the stale window (`SCHEDULER_STALE_RUN_MINUTES`, an hour) is
reclaimable. `reapStaleRunsJob()` marks it `failed` with a reason, and the next
claim of the same key takes it over and increments `attempts`.

Fresh failures are not retried. The distinction is deliberate: a job that failed
five seconds ago probably failed because of something that is still true, and
retrying it every fifteen minutes turns one bad row into a log full of the same
error. After the stale window it is worth another attempt, and the attempt is
visible.

## Two layers of idempotency

A claim alone is not enough. If a run is reaped halfway through, the work it
already did must not happen again. Each scheduled notification therefore carries a
`dedupe_key` as well:

```
claimRun()   →  nobody runs this window twice
dedupe_key   →  nobody is told twice, even if the run was reaped and retried
```

Either layer alone leaves a gap. The claim lets a reaped run resend; the dedupe
keys let two processes race through the same work and only stop at the last write.
Together, a reminder survives a crash mid-run and a deploy at the wrong moment.

The keys are per person, not per day:

| Key | Effect |
| --- | --- |
| `event:<id>:reminder:<user>` | One reminder, even if the event stays published for three days |
| `event:<id>:completed:<user>` | One thank-you |

## The jobs

| Job | Window | Does |
| --- | --- | --- |
| `event-sweeps` | Per day | Reminders for today and tomorrow, then completion |
| `reap-stale-runs` | Every pass | Frees run keys whose holder never came back |

`runEventSweeps()` does two things in one pass because they share the same query
for events whose day is today or tomorrow:

1. Everybody who answered `GOING` is reminded, if their preferences allow the
   `event_reminder` type. `INTERESTED` is not reminded: it is "tell me if there is
   room", not a promise to attend.
2. A `published` event whose day has passed becomes `completed`, and everybody who
   came is thanked.

Calling it twice in a day produces the same database state as calling it once,
even though the second call reports `skipped` — that is the claim doing its job,
not the work being skipped.

## Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `SCHEDULER_ENABLED` | `true` | Off entirely |
| `SCHEDULER_INTERVAL_MS` | `900000` (15 min) | How often to wake up, not how long a job may take |
| `SCHEDULER_STALE_RUN_MINUTES` | `60` | When a run may be taken over |

The interval is not a deadline. Every job claims a key before it does anything, so
a wake-up that lands while the previous one is still running does nothing at all.

The scheduler is off in tests, where the sweeps are asked for directly instead of
waited for. A test that needed a timer would be a test that could be flaky.

`stopScheduler()` clears the interval and the server calls it on shutdown. The
timer is also `unref`'d, so it never holds a process open by itself.

## Health

`schedulerStatus()` reports the ledger, not the process's opinion of itself,
because the ledger is the part that survives a restart:

```json
{
  "enabled": true,
  "intervalMs": 900000,
  "inProcess": true,
  "running": 0,
  "succeeded": 47,
  "failed": 2,
  "last_started": "2026-02-14T08:00:00.000Z"
}
```

`inProcess` says whether *this* process holds a timer. It is not a health verdict
on its own: a deployment with several processes may have one scheduler doing the
work and the rest correctly idle. `last_started` is the number to watch — it going
stale while `enabled` is true is the failure this table exists to make visible.

## Adding a job

1. Write the work as a plain exported function in a service. It takes no clock and
   no interval, and a test can call it with a fixed date.
2. Give it a run key that names its window, as precisely as the work demands —
   `event-sweeps:2026-02-14` is daily; something hourly needs the hour in it.
3. Wrap it in `runJob({ name, runKey, work })`. Do not insert into the ledger by
   hand; the claim is what makes it once.
4. Pass a `dedupeKey` to every notification it creates. A job that can be retried
   after a reap has to be safe to retry.
5. Add it to `runAllJobs()` in dependency order.