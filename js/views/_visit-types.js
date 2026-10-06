// ============================================================================
// _visit-types.js — 6 typów notatek (ustalenie z klientką 2026-05-11).
// Tylko „1sze spotkanie" otwiera pełny wywiad (patrz `visitMode`).
// ============================================================================

export const VISIT_TYPES = [
    {
        id: 'first_meeting',
        label: '1sze spotkanie',
        shortLabel: '1sze spotkanie',
        icon: '🆕',
        description: 'Pierwsza wizyta — pełny wywiad kliniczny (historia, objawy, MSE, rozpoznanie).',
        recommendedFor: 'pierwsza wizyta'
    },
    {
        id: 'next_meeting',
        label: 'Kolejne spotkanie',
        shortLabel: 'Kolejne spotkanie',
        icon: '➕',
        description: 'Wizyta śledząca — notatka z bieżącej sesji + zmiany od poprzedniej.',
        recommendedFor: 'sesja w toku terapii'
    },
    {
        id: 'supervision',
        label: 'Superwizja',
        shortLabel: 'Superwizja',
        icon: '🎓',
        description: 'Notatka z superwizji — refleksje, wskazówki superwizora, plan działań.',
        recommendedFor: 'omówienie pacjenta z superwizorem'
    },
    {
        id: 'admin_note',
        label: 'Notatka administracyjna',
        shortLabel: 'Notatka administracyjna',
        icon: '📋',
        description: 'Wpis administracyjny — np. zmiana terminu, korespondencja z poradnią, formalności.',
        recommendedFor: 'sprawy organizacyjne / formalne'
    },
    {
        id: 'phone_contact',
        label: 'Kontakt telefoniczny',
        shortLabel: 'Kontakt telefoniczny',
        icon: '📞',
        description: 'Rozmowa telefoniczna z pacjentem lub opiekunem — krótka notatka z treści rozmowy.',
        recommendedFor: 'kontakt zdalny / pilna konsultacja'
    },
    {
        id: 'email_contact',
        label: 'Kontakt mailowy',
        shortLabel: 'Kontakt mailowy',
        icon: '✉️',
        description: 'Wymiana e-mailowa — kopia istotnej korespondencji, dyspozycje, ustalenia.',
        recommendedFor: 'kontakt zdalny / pisemny'
    }
];

export function visitTypeById(id) {
    return VISIT_TYPES.find((t) => t.id === id) || null;
}

export function visitTypeLabel(id) {
    const t = visitTypeById(id);
    return t ? t.label : (id || '');
}
