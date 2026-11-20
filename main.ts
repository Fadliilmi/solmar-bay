// Solmar Bay hand-in (Node 22, standard library only). The game is the
// plain static files in game/ beside this file; this program copies game/
// and screenshots/ into the output directory and writes dossier.json, the
// summary the judge reads, using the vendored make.fun library. The output
// directory comes from MAKEFUN_OUTPUT_DIR, or /output when it is unset.
// Running it twice over the same tree produces byte-identical outputs.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The entry's own caps: dossier text at most 163840 bytes; at most 4
// screenshots of at most 262144 bytes each; game/ at most 993 files and
// 50331648 bytes in all, with no path over 1000 bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
