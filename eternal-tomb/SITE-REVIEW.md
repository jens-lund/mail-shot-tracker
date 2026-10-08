# Eternal Tomb site review · 7 October 2026

The six asset sections, shot dependencies, task statuses and image feedback give the project a useful production structure. The dark, restrained visual design fits the film. Scope, deadlines, review queues and milestones cover the path from concept to delivery without requiring a separate planning app. Backups and field-level shared saves are worth keeping.

## Improvements included

- Shot names and descriptions were editable inside Open shot, but the cinematic page appeared fixed. Visible Edit shot, Add shot, order arrows, duration, camera notes and editable asset dependencies now make the shot list usable as the story evolves.
- A trash icon beside each version gives it a clear removal action. Deleted versions and shots have recovery lists, retaining feedback and images rather than destroying iteration history.
- Focus on any input previously stopped automatic refresh, including after its change was saved. Network checks now continue during editing; only unfinished drafts defer the display. A notice explains when teammate updates are waiting, and they appear after the edit ends. Closing a task window flushes its text edits.
- The banner previously occupied a large part of every working page. It stays large on Overview and becomes compact on production pages. Navigation scrolls horizontally on narrow screens.
- Editing now requires a verified GitHub token belonging to an account with repository write access. Visitors can browse. GitHub remains the authority for saving; team display names and the Contributors list do not grant access.
- Image pencils, thumbnails and file-picker areas accept file drops. The same replacement preview and upload controls are used for dropped and chosen files.
- Nicolai is included in the offline team fallback and has pink badges, matching his name in the current shared project. Card name badges and the task window now assign a whole asset or shot in one action; future subtasks inherit the section owner.
- Previs accepts direct MP4/WebM uploads up to 25 MB, stores them before sharing, plays the latest video, and includes locally available video data in backups.

## Best next features

1. **Shot storyboard thumbnails and animatic comparison.** Put the current composition beside duration and camera notes; compare it with the approved frame. This would connect the cinematic plan to actual renders as clearly as the asset sheets do.
2. **My work / team workload.** A one-click list for Jens, Kevin or Nico, with Must have deadlines and total estimated work, would make the next production session easier to plan.
3. **Shot review against the approved frame.** Carry the new image review workflow into final shot approval.

## GitHub sign-in

Token-based connection is available now. A GitHub account still needs repository write access, and its token needs Contents read/write on this repository. Each person should use their own token. Granting write access to Kevin or Nico is a repository-owner action, not a change to the tracker's Team field.

The actual repository permissions checked on 7 October are: `jens-lund` **admin**, `thekevhog` **write**, and `NicoArtz20` **read**. Jens and Kevin can connect editor tokens now. Nico needs repository write access before his own token can publish edits. This update does not expand anyone's repository permissions.

A full Sign in with GitHub flow is feasible, but is not active in this update. It needs a GitHub App registration and installation plus a small authentication service. The service would handle the authorization code and client secret, verify each user and the user's repository permission, and limit the app to this project. The current GitHub Pages website can remain the frontend. Those account/service configuration steps are required before that button can be a real working sign-in. [GitHub documents the required code exchange and client secret here](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app).

## Validation

Automated coverage checks shot creation/order/specs, recoverable deletion, preservation of images/comments, stale operation replay, token verification, read-only access, shared-write conflicts, offline retries, live refresh, whole-section assignments, new-task inheritance, drop routing, video limits and media backups. Browser checks use an isolated local shared-save service so test shots, uploaded videos and versions never alter the production project. A separate browser origin verifies shared video playback without the uploader's local storage.

## Follow-up shipped · 8 October 2026

Review now combines tasks and versions, uses responsive image grids, supports creator updates and review requests, and posts drawing annotations as feedback images. Text areas resize automatically. Project/page text, categories, image captions/types and milestones are editable. Small gray removal controls retain posted work in recovery; Activity records the verified GitHub editor, before/after values and safe undo. Older history stays available. Relevant teammate edits and comments produce a subtle badge/notice using shared polling. Online presence was explicitly deferred.

Eight regression suites and isolated browser checks cover drawing submission, real uploads, 3/4-image layouts, comment/image/version/section recovery, growing text, safe drag selection, branding/page/milestone edits, public read-only access, and a second editor’s feedback appearing without reload. Test data stays outside the published project.
