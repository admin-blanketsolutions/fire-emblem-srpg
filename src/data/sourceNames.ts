/**
 * Short names for the sources in the ledger's register (docs/SOURCES.md §2), for the Codex. The
 * ledger is the authority; a test checks that every id here is a row there.
 */
export const SOURCE_NAMES: Readonly<Record<string, string>> = {
  'SRC-IS': 'Ibn Shaddad',
  'SRC-IAI-BARQ': 'Imad ad-Din, al-Barq al-Shami',
  'SRC-IAI-FATH': 'Imad ad-Din, al-Fath al-Qussi',
  'SRC-IAT': 'Ibn al-Athir',
  'SRC-ASH': 'Abu Shama',
  'SRC-IKH': 'Ibn Khallikan',
  'SRC-IW': 'Ibn Wasil',
  'SRC-IK': 'Ibn Kathir',
  'SRC-DH': 'al-Dhahabi',
  'SRC-MQ': 'al-Maqrizi',
  'SRC-IJ': 'Ibn Jubayr',
  'SRC-UM': 'Usama ibn Munqidh',
  'SRC-QF': 'al-Qadi al-Fadil',
  'SRC-IQ': 'Ibn al-Qalanisi',
  'SRC-ABT': 'Ibn Abi Tayy',
  'SRC-WT': 'William of Tyre',
  'SRC-ITIN': 'Itinerarium Peregrinorum',
  'SRC-AMB': 'Ambroise',
  'SRC-ERN': 'Ernoul',
  'MOD-LEV': 'Y. Lev, Saladin in Egypt',
  'MOD-LYONS-JACKSON': 'Lyons and Jackson, Saladin',
  'MOD-EDDE': 'A.-M. Eddé, Saladin',
  'MOD-PHILLIPS': 'J. Phillips, The Life and Legend of the Sultan Saladin',
};

/** A readable name for a ledger id: a source's name, or the claim it points to. */
export function sourceName(id: string): string {
  const name = SOURCE_NAMES[id];
  if (name) return name;
  if (/^CH-[A-Z0-9]+\.E\d+$/.test(id)) return `ledger ${id}`;
  if (/^D-\d+$/.test(id)) return `DECISIONS ${id}`;
  return id;
}
