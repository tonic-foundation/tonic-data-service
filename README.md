Combined tonic indexer + data service + leaderboard sevice monorepo.

- `indexer` - indexer code and **all migrations**, including leaderboard, tv
  chart, etc. all of them are in there because they're managed with diesel
- `api` - api and client code
- `.github` - github actions. publishes client code to npm when you cut a new
  release. remember to bump version with `yarn version <major|minor|patch>` when
  you do this (can be before or after but before is better to keep the version
  commit in the release)

## Running

- See indexer docs for running indexer
- See api docs for running data api
- Data api docs have more info for running leaderboard and rewards programs.
  Those are both fairly manual.

## Developing

### Add a new migration

Go to indexer directory and `diesel migration generate add_whatever_table`.

Ensuring migrations run is on you.
