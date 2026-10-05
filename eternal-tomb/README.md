# Eternal Tomb production tracker

Open `index.html` directly, or visit the published `/eternal-tomb/` page. No installation or build is needed. The seed includes six asset sections, five shots (seven stages each), and five milestones. Nothing is marked complete until the team updates it.

- **Overview:** asset/cinematic progress, current milestone, blockers and asset cards.
- **Assets:** searchable cards; open tasks to set owner, deadline, status, blockers, notes and working-file link. Add specific tasks as needed.
- **Cinematic:** provisional story beats with linked asset dependencies. Layout can begin with placeholders.
- **Versions & feedback:** each asset has its own version history, main sheet, front/back/left/right angle slots, clothing/detail/progress images and side-by-side comparison. Create a version, upload images, select your name, address feedback to a teammate and optionally link a comment to an image. Mark resolved feedback when it is handled. The troll starts with an AI-generated concept version; it is not actual production progress.
- **Milestones:** manually reviewed approval gates through final export and backup.
- **Settings:** project title, team, delivery date, latest previs and team saving.
- **Backup:** export/import JSON. Import explicitly replaces the current project after confirmation.

Changes save immediately to this browser. GitHub team sync uses a personal token with **Contents: Read and write** on `jens-lund/mail-shot-tracker`. A previously saved Mail token is reused unless separate Eternal Tomb settings have been saved. The token stays in browser storage and is never included in exports or repository data. Clearing this project's token does not change Mail settings.

Use the pencil at the top-right of the project banner, asset thumbnails or version images to choose a replacement PNG/JPEG/WebP. The dialog previews your choice before you save. Asset thumbnail changes affect the card and task header only. Replacing a version image keeps its role and linked comments, and also updates the asset thumbnail when that image was used as the cover. Other versions stay unchanged. Create a new version first when you want to retain the earlier image for comparison. Standalone covers and banner uploads are included in team sync and backups.

With a token, edits are replayed onto the latest `eternal-tomb/data/project.json` using GitHub's SHA concurrency check. Unrelated teammate edits are preserved; simultaneous changes to the same field use the last successful save. Offline edits stay queued for reconnection. Use Refresh to retry a failed save. With no token, edits are local to the current browser. The public repository's data and links remain public.

Progress counts completed tasks. Asset readiness and cinematic completion are separate. A section is done when all its tasks are complete and it has no blocker. Milestones require explicit review; task percentages do not approve them automatically.

`data/project.json` is the shared source. `seed.js` is its initial offline fallback, including all shot tasks. Generated cave, character-sheet and clothing references live in `images/`; see `CONCEPTS.md` for prompts. They are inspiration, not final production designs.

Uploaded PNG/JPEG/WebP images are resized to a maximum 2000px edge and saved as WebP in browser IndexedDB. A version can contain 64 images; an input image can be up to 15 MB. Without a token, images and feedback are local to that browser. With team sync, images are published to `eternal-tomb/uploads/` before the shared project record is saved. Export backups include uploaded images available on the current browser; shared images from another device retain their repository links. Import restores included images. Do not clear browser data until your changes are synced or backed up.

For local preview, run `node tools/preview.cjs` from the repository root and open `http://127.0.0.1:4173/eternal-tomb/`. Run `node eternal-tomb/tests/core.cjs` for persistence, validation and merge checks.
