# Learnyst API — payload/response schemas

Single source of truth for every Learnyst endpoint `learnystTranscriptRefresh.js`
(`packages/jobs-runtime/`) calls. Reverse-engineered from a live HAR capture of
`learn.soic.in` (2026-08-20) plus a user-supplied cURL for the GraphQL endpoint
— **all three endpoints below are confirmed live**, not guessed from docs
(Learnyst has none public for this).

Auth: a single JWT (`LEARNYST_AUTH_TOKEN`) issued on login to the Learnyst
school, reused across all three endpoints below — **but the header NAME
differs per endpoint**, confirmed from the HAR, not assumed:

| Endpoint | Header name |
|---|---|
| GraphQL `ShowBundleCourses` (apig.learnyst.com/learn) | `authorization: Bearer <token>` |
| REST course detail (apig.learnyst.com/learner/v17/courses/{id}) | `lystauthorization: Bearer <token>` |
| Transcript fetch (ai-api.learnyst.com/api/transcript-data) | `authorization: Bearer <token>` |

The token is a JWT with a real `exp` claim (decode it — e.g. on jwt.io — to
check expiry). It is tied to a logged-in browser session, so it WILL expire;
there is no known longer-lived API key for this Learnyst tenant. A 401/403
from any of these three endpoints means the token needs manual refresh (log
into the school in Chrome, DevTools → Network → copy a fresh `authorization`
or `lystauthorization` header value from any request).

---

## 1. POST apig.learnyst.com/learn (GraphQL — `ShowBundleCourses`)

Lists every module ("course") inside a bundle (e.g. a paid membership).
Confirmed live 2026-08-20 via a user-supplied cURL.

**Request:**

```json
{
  "operationName": "ShowBundleCourses",
  "variables": {},
  "extensions": { "clientLibrary": { "name": "@apollo/client", "version": "4.0.4" } },
  "query": "query ShowBundleCourses {\n  showBundleCourses(schoolId: \"110998\", id: \"97666\") {\n    seoTitle\n    title\n    courseType\n    bundleCourses {\n      title\n      id\n      status\n      courseType\n      lessonCount\n      seoTitle\n      imageUrl\n      trialLessonsCount\n      startTime\n      endTime\n      __typename\n    }\n    __typename\n  }\n}"
}
```

Headers: `authorization: Bearer <token>`, `content-type: application/json`,
`origin`/`referer` set to the school's site (e.g. `https://learn.soic.in`),
`x-lyst-rls: prod`.

`schoolId` and the bundle `id` are baked directly into the query string (not
passed as GraphQL `variables`) — this is what the live client actually sends,
keep that shape.

**Response** (`data.showBundleCourses`):

```json
{
  "seoTitle": "SOIC-Course",
  "title": "SOIC Membership",
  "courseType": 3,
  "bundleCourses": [
    {
      "title": "Level 3 How to Value a Company & Portfolio Creation!",
      "id": "145316",
      "status": 2,
      "courseType": 1,
      "lessonCount": 13,
      "seoTitle": "how-to-value-a-company",
      "imageUrl": "https://...",
      "trialLessonsCount": null,
      "startTime": null,
      "endTime": null,
      "__typename": "ProductListing"
    }
  ]
}
```

Notes:
- `courseType: 1` = a real course/module with lessons. Other values exist —
  confirmed `courseType: 11` = an external community link (e.g. a Telegram
  group), `lessonCount: null`, no lessons to fetch. Filter to `courseType ===
  1` before crawling further; anything else is not a video course.
- `id` is the numeric course id used in endpoint #2 below.

---

## 2. GET apig.learnyst.com/learner/v17/courses/{course_id}

Lists one module's sections + lessons. Confirmed live 2026-08-20 from HAR.

**Request:**

```
GET https://apig.learnyst.com/learner/v17/courses/145316
    ?is_from_classroom=true&school_id=110998&device_type=4&is_id=true
    &bundle_id=97666&vl=1
Header: lystauthorization: Bearer <token>
```

**Response**: the HTTP body is **base64-encoded JSON** — decode
(`Buffer.from(text, 'base64').toString('utf8')`) then `JSON.parse`. Decoded,
the object has ~60 top-level fields; only these are used:

```json
{
  "id": 145316,
  "title": "Level 3 How to Value a Company & Portfolio Creation!",
  "seo_title": "how-to-value-a-company",
  "sections": [
    { "id": 340917, "title": "How to Value Companies", "course_id": 145316, "position": 0, "resource_section_id": 340917 }
  ],
  "lessons": [
    {
      "id": 2172995,
      "title": "What you will Learn in this Course? Intro",
      "duration": 108,
      "lesson_type": 1,
      "lesson_data": "[{\"src\":\"...\",\"src_type\":2,\"content_path\":\"110998/.../b3ead4f4b1dea70f0ca08cd2c3478ffe\", ...}]",
      "section_id": 340917,
      "position": 0
    }
  ]
}
```

All other top-level fields (`completed_lesson_ids`, `esign_status`,
`next_payment_date`, `user_course_id`, `selected_pricing_plan`, `is_bought`,
and ~50 more) are **learner-account-specific state** (this Learnyst account's
relationship to the course — progress, billing) — deliberately dropped by
`fetchModuleLessons()`, never persisted.

Field notes:
- `lesson_type: 1` = video lesson (has a transcript). Other confirmed values:
  `5` = quiz, `9` = article/HTML lesson. Neither has a transcript to fetch —
  recorded as skipped, not an error.
- `lesson_data` is itself a **JSON string** (not an object) — `JSON.parse` it
  to get an array of media track objects. The video track has `src_type: 2`;
  its `content_path` is the identifier endpoint #3 needs. A lesson's
  `lesson_data` array may also include non-video tracks (PDFs, etc, other
  `src_type` values) — always pick `src_type === 2` (fall back to the first
  entry if none matches, for robustness against a future lesson shape).

---

## 3. GET ai-api.learnyst.com/api/transcript-data

Fetches the AI-generated transcript for one video's `content_path`. Confirmed
live 2026-08-20 from HAR (the original request the whole pipeline was built
from).

**Request:**

```
GET https://ai-api.learnyst.com/api/transcript-data
    ?content_type=video&content_path=110998/.../b3ead4f4b1dea70f0ca08cd2c3478ffe
Header: authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "data": {
    "00:00:00": "Hi Investors and welcome in the course of How to value a company.",
    "00:00:03": "And perhaps this is the most important course of the entire membership.",
    "00:00:06": "Why am I saying this?"
  }
}
```

`data` is an object keyed by `"HH:MM:SS"` timestamp strings, each mapping to
one transcript line — NOT a chronologically-ordered array. Sort the keys
lexicographically (`HH:MM:SS` strings sort correctly as plain strings for any
video under 100 hours) to reconstruct transcript order; `transcriptTexts()`
in `learnystTranscriptRefresh.js` does this and produces both a
`[HH:MM:SS] text` timestamped version and a flowing plain-text version.

Unconfirmed: whether this endpoint can return a different shape (e.g. a flat
`transcript` string, or a `segments` array) for videos processed by an older
version of Learnyst's transcription pipeline — only the timestamp-object
shape above has been observed live. If a future response doesn't match, it
will surface as `transcriptTimestamped: null` in the saved record (silent
data-loss risk) rather than a hard error — worth revisiting if that ever
shows up in a run's summary.

---

## Rate limiting (operational, not part of the API contract)

Not documented by Learnyst; empirically no 429s were observed testing ~15
lesson fetches with 1.5s between transcript calls and 10s between modules
(see `learnystTranscriptRefresh.js` `LEARNYST_REQUEST_DELAY_MS` /
`LEARNYST_MODULE_DELAY_MS`). Treat the transcript endpoint (#3, called once
per lesson — can be 700+ calls for a full membership) as the highest-risk one
for undocumented limits; the other two are called at most once per module
(15-ish calls for the current SOIC Membership).
