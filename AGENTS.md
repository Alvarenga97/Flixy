<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Movie data comes from TMDB only through server functions in src/lib/tmdb.functions.ts; the API key stays server-side.
- App state (auth user, profile, history) lives in src/hooks/use-app.tsx; profile is cached locally and synced to the backend when signed in.
- Application data lives in Neon through src/lib/neon.server.ts gateway helpers; Lovable Cloud remains the identity provider, and authenticated server functions enforce ownership.
