# Solmar Bay — an original open-world crime game

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Fadliilmi/solmar-bay/rank.svg)](https://make.fun/c/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Fadliilmi/solmar-bay/reward.svg)](https://make.fun/c/gta6-01)

**Solmar Bay** is an original open-world crime game built for the
[Make GTA 6 competition](https://make.fun/c/gta6-01) on make.fun. No
libraries, no network, no assets borrowed from anywhere: a seeded city,
six stealable cars, a five-star wanted system, six story missions, and a
fully synthesized soundtrack — all in plain static files.

## Play it

Serve `game/` with any static server and open `game/index.html` in desktop
Chrome:

```sh
python3 -m http.server 8080 --directory game
# open http://localhost:8080
```

## The game

Rico Vega is back in Solmar Bay, and his fixer Tía Carmen has work for him:
six story missions across seven districts — Downtown, Old Town, the Marina,
Beachfront, Industrial, the Suburbs and Palm Park — ending in the bank job
everyone in the city is whispering about: **The Solmar Score**.

- **Open world** — a seeded city on a road graph: traffic that follows the
  streets, pedestrians who flee gunfire, a beach, a marina with piers, and
  a park with a pond.
- **Six cars to steal and drive** — Vela Sedan, Cometa GT, Rancho Pickup,
  Brisa Convertible, Carguero Van and Bajito Lowrider, each with its own
  speed and handling. Walk up to any parked car and press **E**.
- **Wanted 0–5 stars** — the SBPD answers with patrol cars (sirens,
  ramming, road-graph pursuit) and foot officers who arrest. Lose the heat
  at a Pay ’n Spray, or wait it out.
- **Combat** — fists and a pistol, mouse aim, armed rival crews.
- **Six missions** — from stealing your first wheels to the Solmar Bank
  job, with a mission tracker, markers and Tía Carmen's briefings.
- **8 hidden Sun Coins** — scattered across the city, $250 each.
- **City services** — Ammo-Nation gun shop, Pay ’n Spray, Solmar General
  Hospital, and a safehouse.
- **HUD** — live minimap, wanted stars, cash, health/armour, weapon and
  ammo, mission tracker, clock and speedometer.
- **Day/night cycle** — headlights, lit windows and streetlight pools
  after dark.
- **Sound** — fully synthesized WebAudio: engine, two-tone sirens,
  gunfire, and Radio Solmar, an original chiptune station (**R** toggles).
- **Saves** — progress (cash, coins, missions) is kept in localStorage.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive in a car |
| Mouse | Aim (on foot) |
| Click | Shoot / punch |
| E | Enter or exit a car, interact |
| Q | Switch fists / pistol |
| R | Radio Solmar on / off |
| P / Esc | Pause |
| Enter | Start / continue |

## Screenshots

All four are real renders of the game's own code, staged deterministically
with `?shot=cover|street|beach|night&seed=1`:

1. `1-cover.jpg` — a car chase through Downtown, three SBPD cars behind,
   the bank job on.
2. `2-street.jpg` — Rico on foot Downtown, first mission.
3. `3-beach.jpg` — a shootout on the Beachfront sand.
4. `4-night.jpg` — a night drive to the marina with the headlights on.

## Build

The entry is handed in by `main.ts`, which copies `game/` and
`screenshots/` to `/output` and writes `/output/dossier.json` with the
vendored make.fun library (`vendor/makefun-game.ts`, unchanged from the
kit). Outside the grader, `MAKEFUN_OUTPUT_DIR` stands in for `/output`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Run it twice and the two outputs are byte for byte identical.

## License

MIT — see [LICENSE](LICENSE).
