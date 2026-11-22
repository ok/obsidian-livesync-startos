import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '1.0.52:0',
  releaseNotes: {
    en_US:
      'Updated Self-hosted LiveSync to 1.0.52. A small update for the vault mirror: it uses less memory when syncing large files, and no longer searches the whole vault for a file that has not arrived yet or was already deleted. Full notes: https://github.com/vrtmrz/obsidian-livesync/blob/1.0.52/updates.md',
    es_ES:
      'Self-hosted LiveSync actualizado a 1.0.52. Una actualización menor para la réplica de la bóveda: usa menos memoria al sincronizar archivos grandes y ya no recorre toda la bóveda en busca de un archivo que aún no ha llegado o que ya se eliminó. Notas completas: https://github.com/vrtmrz/obsidian-livesync/blob/1.0.52/updates.md',
    de_DE:
      'Self-hosted LiveSync auf 1.0.52 aktualisiert. Ein kleines Update für den Vault-Spiegel: Er benötigt beim Synchronisieren großer Dateien weniger Arbeitsspeicher und durchsucht nicht mehr den gesamten Vault nach einer Datei, die noch nicht angekommen ist oder bereits gelöscht wurde. Vollständige Hinweise: https://github.com/vrtmrz/obsidian-livesync/blob/1.0.52/updates.md',
    pl_PL:
      'Zaktualizowano Self-hosted LiveSync do 1.0.52. Niewielka aktualizacja kopii lustrzanej sejfu: zużywa mniej pamięci podczas synchronizacji dużych plików i nie przeszukuje już całego sejfu w poszukiwaniu pliku, który jeszcze nie dotarł lub został już usunięty. Pełne informacje: https://github.com/vrtmrz/obsidian-livesync/blob/1.0.52/updates.md',
    fr_FR:
      'Self-hosted LiveSync mis à jour vers 1.0.52. Une petite mise à jour pour le miroir du coffre : il utilise moins de mémoire lors de la synchronisation de fichiers volumineux et ne parcourt plus tout le coffre à la recherche d’un fichier qui n’est pas encore arrivé ou qui a déjà été supprimé. Notes complètes : https://github.com/vrtmrz/obsidian-livesync/blob/1.0.52/updates.md',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
