// ============================================================================
// _storage-errors.js — wspólny typ błędu magazynu danych.
//
// code:
//   'auth'    — trzeba ponownie potwierdzić dostęp (wygasła sesja Google,
//               cofnięte uprawnienie do folderu). Wymaga kliknięcia użytkownika.
//   'offline' — brak sieci / serwer chwilowo nie odpowiada. Ponawiamy sami.
//   'io'      — zapis lub odczyt się nie powiódł z innego powodu.
//   'format'  — plik istnieje, ale nie jest dokumentem pacjenta.
// ============================================================================

export class StorageError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'StorageError';
        this.code = code;
    }
}

export function storageErrorCode(err) {
    return (err && err.code) || 'io';
}
