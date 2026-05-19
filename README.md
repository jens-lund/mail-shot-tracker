# Mail Shot Tracker

Statisk GitHub Pages-side for å følge shot-status på 3D-filmen `Mail`.

## Bruk

Åpne siden, trykk `Rediger`, og bruk passordet:

```text
mail
```

Deretter kan dere endre shot-navn, scene, notater og huke av:

`Done`, `Enviroment`, `Characters`, `Assets`, `Animasjon`, `Lys`, `Kamera`, `Render`, `Compositing`

Når `Done` hukes av, markeres hele shotet som ferdig og progress går til 100%.

## GitHub Pages

Legg hele mappen i et GitHub-repo og aktiver GitHub Pages fra repoets `main` branch.

Siden består bare av statiske filer:

- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `data/shots.json`
- `images/`

## Online redigering

GitHub Pages kan ikke trygt lagre en hemmelig skrive-nøkkel i selve nettsiden. Derfor bruker løsningen personlig GitHub-token for hver redaktør.

1. Gi vennene tilgang til GitHub-repoet.
2. Lag en fine-grained GitHub-token med `Contents: Read and write` for dette repoet.
3. Åpne tannhjulet i nettsiden.
4. Fyll inn owner, repo, branch og token.
5. Etter dette blir endringer automatisk skrevet til `data/shots.json`.

Passordet låser bare opp redigeringsmodus i grensesnittet. GitHub-token er det som faktisk gir lov til å skrive til repoet.

## Lokal forhåndsvisning

Du kan dobbeltklikke `index.html` direkte. Da bruker siden en innebygd shot-liste fordi nettleseren ofte blokkerer lesing av `data/shots.json` fra lokale filer.

Når siden ligger på GitHub Pages, leser den `data/shots.json` normalt.
