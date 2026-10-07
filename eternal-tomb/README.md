# Eternal Tomb production tracker

Open `index.html` directly, or visit the published `/eternal-tomb/` page. No installation or build is needed. The seed includes six asset sections, five shots (seven stages each), and five milestones. Nothing is marked complete until the team updates it.

- **Overview:** clickable progress and status counts, current milestone and asset cards. “Due soon / overdue” lists unfinished Must have work due within three calendar days, with links to its task and calendar. Nice to have work stays out of reminders.
- **Assets:** searchable cards with red Not started, yellow In progress, blue Review and green Done tasks. Click a task to edit its name, description, owner, due date, effort and importance. Add and remove subtasks freely; removal also removes their feedback after an inline confirmation. Export a backup first if you need to keep a copy.
- **Tasks:** all asset and shot subtasks in one place, with status and effort filters, search, and sorting by importance/deadline or smallest effort first. Small/Medium/Large estimates workload; Must have/Nice to have determines importance.
- **Scope:** All work, Must have only, or Nice to have only. The choice applies to cards, subtasks, progress, status counts, calendar and review queue. A Nice to have section makes all of its subtasks optional, even if a subtask is marked Must have.
- **Calendar:** month grid and deadline agenda for both section deadlines and independently dated subtasks. Select a day, move between months, or click an entry to jump directly to its task. Subtasks without dates do not inherit the section deadline.
- **Review:** only current tasks marked Review, for both assets and shots. Select a task, upload its current images, choose your name, and post comments. Click an image to place a comment marker; keyboard users can focus the image and press Enter to mark its centre. The comment list also names each marker and its position. Resolve comments, request changes (In progress), or approve (Done). Post a draft comment before changing status.
- **Cinematic:** provisional story beats with linked asset dependencies. Layout can begin with placeholders.
- **Version history:** the existing asset versions, angle images, comparisons and feedback remain available separately. The troll starts with an AI-generated concept version; it is not actual production progress.
- **Milestones:** manually reviewed approval gates through final export and backup.
- **Settings:** project title, team, delivery date, latest previs and team saving.
- **Backup:** export/import JSON. Import explicitly replaces the current project after confirmation.

Changes save immediately to this browser. GitHub team sync uses a personal token with **Contents: Read and write** on `jens-lund/mail-shot-tracker`. A previously saved Mail token is reused unless separate Eternal Tomb settings have been saved. The token stays in browser storage and is never included in exports or repository data. Clearing this project's token does not change Mail settings.

Use the pencil at the top-right of the project banner, asset thumbnails or version images to choose a replacement PNG/JPEG/WebP. The dialog previews your choice before you save. Asset thumbnail changes affect the card and task header only. Replacing a version image keeps its role and linked comments, and also updates the asset thumbnail when that image was used as the cover. Other versions stay unchanged. Create a new version first when you want to retain the earlier image for comparison. Standalone covers and banner uploads are included in team sync and backups.

With a token, edits are replayed onto the latest `eternal-tomb/data/project.json` using GitHub's SHA concurrency check. Unrelated teammate edits are preserved; simultaneous changes to the same field use the last successful save. Deleted task IDs prevent stale edits from recreating removed tasks. Offline edits stay queued for reconnection. Use Refresh to retry a failed save. The site checks shared updates every 30 seconds while visible, pausing automatic refresh for open dialogs, active editors, drafts and selected uploads. With no token, edits are local to the current browser. The public repository's data and links remain public.

Progress counts completed tasks within the current scope. Asset readiness and cinematic completion are separate. Milestones require explicit review; task percentages do not approve them automatically. Existing blocker notes are preserved in backups, while the main workflow uses importance and deadline reminders.

`data/project.json` is the shared source. `seed.js` is its initial offline fallback, including all shot tasks. Generated cave, character-sheet and clothing references live in `images/`; see `CONCEPTS.md` for prompts. They are inspiration, not final production designs.

Uploaded PNG/JPEG/WebP images are resized to a maximum 2000px edge and saved as WebP in browser IndexedDB. A version can contain 64 images; an input image can be up to 15 MB. Without a token, images and feedback are local to that browser. With team sync, images are published to `eternal-tomb/uploads/` before the shared project record is saved. Export backups include uploaded images available on the current browser; shared images from another device retain their repository links. Import restores included images. Do not clear browser data until your changes are synced or backed up.

Task review uploads use the same image storage, team publishing and backup system as asset versions. Each task supports up to 64 images and 500 comments. Earlier project files and backups are upgraded automatically when read; no shared task state is reset.

For local preview, run `node tools/preview.cjs` from the repository root and open `http://127.0.0.1:4173/eternal-tomb/`. Run `node eternal-tomb/tests/core.cjs`, `node eternal-tomb/tests/workflow.cjs` and `node eternal-tomb/tests/sync.cjs` for validation, scope/date behavior, deletion, annotation, media and shared-save checks.

