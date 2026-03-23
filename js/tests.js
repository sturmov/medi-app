// ============================================================================
// tests.js - PHQ-9 and GAD-7 Screening Tests (uses existing HTML questions)
// ============================================================================

const Tests = {
    currentPatient: null,

    init() {
        this.bindEvents();
    },

    onPatientChanged(patient) {
        this.currentPatient = patient || null;
        this._renderHistoryPHQ9();
        this._renderHistoryGAD7();
        this._renderChart();
    },

    bindEvents() {
        // PHQ-9: live score on radio change
        for (let i = 1; i <= 9; i++) {
            document.querySelectorAll('input[name="phq9_q' + i + '"]').forEach(r => {
                r.addEventListener('change', () => this._updatePHQ9Score());
            });
        }

        // GAD-7: live score on radio change
        for (let i = 1; i <= 7; i++) {
            document.querySelectorAll('input[name="gad7_q' + i + '"]').forEach(r => {
                r.addEventListener('change', () => this._updateGAD7Score());
            });
        }

        // Save buttons
        const btnPHQ9 = document.getElementById('btn-save-phq9');
        if (btnPHQ9) btnPHQ9.addEventListener('click', () => this._savePHQ9());

        const btnGAD7 = document.getElementById('btn-save-gad7');
        if (btnGAD7) btnGAD7.addEventListener('click', () => this._saveGAD7());
    },

    // ---- PHQ-9 ----
    _calcPHQ9() {
        let total = 0;
        let answered = 0;
        for (let i = 1; i <= 9; i++) {
            const r = document.querySelector('input[name="phq9_q' + i + '"]:checked');
            if (r) { total += parseInt(r.value, 10); answered++; }
        }
        return { total, answered, complete: answered === 9 };
    },

    _interpretPHQ9(score) {
        if (score <= 4) return { text: 'Minimalna depresja', color: '#059669' };
        if (score <= 9) return { text: 'Łagodna depresja', color: '#D97706' };
        if (score <= 14) return { text: 'Umiarkowana depresja', color: '#EA580C' };
        if (score <= 19) return { text: 'Umiarkowanie ciężka depresja', color: '#DC2626' };
        return { text: 'Ciężka depresja', color: '#991B1B' };
    },

    _updatePHQ9Score() {
        const r = this._calcPHQ9();
        const scoreEl = document.getElementById('phq9-score');
        const interpEl = document.getElementById('phq9-interpretation');
        if (scoreEl) scoreEl.textContent = r.total;
        if (interpEl) {
            const interp = this._interpretPHQ9(r.total);
            interpEl.textContent = interp.text;
            interpEl.style.color = interp.color;
            interpEl.style.fontWeight = '600';
        }
    },

    _savePHQ9() {
        if (!this.currentPatient) {
            App.showNotification('Proszę wybrać pacjenta.', 'error');
            return;
        }
        const r = this._calcPHQ9();
        if (!r.complete) {
            App.showNotification('Proszę odpowiedzieć na wszystkie 9 pytań.', 'error');
            return;
        }
        if (!this.currentPatient.testy) this.currentPatient.testy = [];
        const interp = this._interpretPHQ9(r.total);
        const answers = [];
        for (let i = 1; i <= 9; i++) {
            const el = document.querySelector('input[name="phq9_q' + i + '"]:checked');
            answers.push(el ? parseInt(el.value, 10) : 0);
        }
        this.currentPatient.testy.push({
            typ: 'PHQ9',
            data: document.getElementById('phq9Data')?.value || new Date().toISOString().slice(0, 10),
            odpowiedzi: answers,
            wynik: r.total,
            interpretacja: interp.text
        });
        if (typeof XlsxHandler !== 'undefined') XlsxHandler.scheduleAutoSave(this.currentPatient);
        App.showNotification('Wynik PHQ-9 zapisany: ' + r.total + '/27 — ' + interp.text, 'success');
        this._renderHistoryPHQ9();
        this._renderChart();
    },

    _renderHistoryPHQ9() {
        const tbody = document.querySelector('#phq9-history tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!this.currentPatient || !this.currentPatient.testy) return;
        const results = this.currentPatient.testy.filter(t => t.typ === 'PHQ9');
        results.slice().reverse().forEach(t => {
            const interp = this._interpretPHQ9(t.wynik);
            const tr = document.createElement('tr');
            tr.innerHTML = '<td>' + (t.data || '-') + '</td><td><strong>' + t.wynik + '</strong>/27</td><td style="color:' + interp.color + ';font-weight:600">' + t.interpretacja + '</td>';
            tbody.appendChild(tr);
        });
    },

    // ---- GAD-7 ----
    _calcGAD7() {
        let total = 0;
        let answered = 0;
        for (let i = 1; i <= 7; i++) {
            const r = document.querySelector('input[name="gad7_q' + i + '"]:checked');
            if (r) { total += parseInt(r.value, 10); answered++; }
        }
        return { total, answered, complete: answered === 7 };
    },

    _interpretGAD7(score) {
        if (score <= 4) return { text: 'Minimalny lęk', color: '#059669' };
        if (score <= 9) return { text: 'Łagodny lęk', color: '#D97706' };
        if (score <= 14) return { text: 'Umiarkowany lęk', color: '#EA580C' };
        return { text: 'Ciężki lęk', color: '#DC2626' };
    },

    _updateGAD7Score() {
        const r = this._calcGAD7();
        const scoreEl = document.getElementById('gad7-score');
        const interpEl = document.getElementById('gad7-interpretation');
        if (scoreEl) scoreEl.textContent = r.total;
        if (interpEl) {
            const interp = this._interpretGAD7(r.total);
            interpEl.textContent = interp.text;
            interpEl.style.color = interp.color;
            interpEl.style.fontWeight = '600';
        }
    },

    _saveGAD7() {
        if (!this.currentPatient) {
            App.showNotification('Proszę wybrać pacjenta.', 'error');
            return;
        }
        const r = this._calcGAD7();
        if (!r.complete) {
            App.showNotification('Proszę odpowiedzieć na wszystkie 7 pytań.', 'error');
            return;
        }
        if (!this.currentPatient.testy) this.currentPatient.testy = [];
        const interp = this._interpretGAD7(r.total);
        const answers = [];
        for (let i = 1; i <= 7; i++) {
            const el = document.querySelector('input[name="gad7_q' + i + '"]:checked');
            answers.push(el ? parseInt(el.value, 10) : 0);
        }
        this.currentPatient.testy.push({
            typ: 'GAD7',
            data: document.getElementById('gad7Data')?.value || new Date().toISOString().slice(0, 10),
            odpowiedzi: answers,
            wynik: r.total,
            interpretacja: interp.text
        });
        if (typeof XlsxHandler !== 'undefined') XlsxHandler.scheduleAutoSave(this.currentPatient);
        App.showNotification('Wynik GAD-7 zapisany: ' + r.total + '/21 — ' + interp.text, 'success');
        this._renderHistoryGAD7();
        this._renderChart();
    },

    _renderHistoryGAD7() {
        const tbody = document.querySelector('#gad7-history tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!this.currentPatient || !this.currentPatient.testy) return;
        const results = this.currentPatient.testy.filter(t => t.typ === 'GAD7');
        results.slice().reverse().forEach(t => {
            const interp = this._interpretGAD7(t.wynik);
            const tr = document.createElement('tr');
            tr.innerHTML = '<td>' + (t.data || '-') + '</td><td><strong>' + t.wynik + '</strong>/21</td><td style="color:' + interp.color + ';font-weight:600">' + t.interpretacja + '</td>';
            tbody.appendChild(tr);
        });
    },

    // ---- Chart ----
    _renderChart() {
        const container = document.getElementById('chart-container');
        if (!container) return;
        container.innerHTML = '';
        if (!this.currentPatient || !this.currentPatient.testy || this.currentPatient.testy.length === 0) {
            container.innerHTML = '<p class="text-muted">Brak danych do wykresu. Zapisz wynik testu.</p>';
            return;
        }

        const phq = this.currentPatient.testy.filter(t => t.typ === 'PHQ9');
        const gad = this.currentPatient.testy.filter(t => t.typ === 'GAD7');

        let html = '<div style="display:flex;gap:40px;flex-wrap:wrap;">';

        if (phq.length > 0) {
            html += '<div><h4 style="margin-bottom:8px">PHQ-9</h4><div style="display:flex;align-items:flex-end;gap:6px;height:140px;">';
            phq.forEach(t => {
                const h = Math.max(4, Math.round((t.wynik / 27) * 120));
                const interp = this._interpretPHQ9(t.wynik);
                html += '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;"><span style="font-size:11px;font-weight:600">' + t.wynik + '</span><div style="width:28px;height:' + h + 'px;background:' + interp.color + ';border-radius:4px 4px 0 0;" title="' + t.data + ': ' + t.wynik + '/27"></div><span style="font-size:10px;color:#6B7280">' + (t.data || '').slice(5) + '</span></div>';
            });
            html += '</div></div>';
        }

        if (gad.length > 0) {
            html += '<div><h4 style="margin-bottom:8px">GAD-7</h4><div style="display:flex;align-items:flex-end;gap:6px;height:140px;">';
            gad.forEach(t => {
                const h = Math.max(4, Math.round((t.wynik / 21) * 120));
                const interp = this._interpretGAD7(t.wynik);
                html += '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;"><span style="font-size:11px;font-weight:600">' + t.wynik + '</span><div style="width:28px;height:' + h + 'px;background:' + interp.color + ';border-radius:4px 4px 0 0;" title="' + t.data + ': ' + t.wynik + '/21"></div><span style="font-size:10px;color:#6B7280">' + (t.data || '').slice(5) + '</span></div>';
            });
            html += '</div></div>';
        }

        html += '</div>';
        container.innerHTML = html;
    }
};
