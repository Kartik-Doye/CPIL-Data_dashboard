// filters.js — sidebar toggle, menu group expand/collapse, time button logic

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    if (window.innerWidth <= 768) {
        sb.classList.toggle('open');
    } else {
        sb.classList.toggle('collapsed');
    }
}

function toggleGroup(header) {
    const group = header.parentElement;
    group.classList.toggle('collapsed');
}

function setTime(value) {
    document.getElementById('time-field').value = value;
    document.getElementById('filter-form').submit();
}

// Filter bar interactions
document.addEventListener('DOMContentLoaded', function() {
    // Keep current filter state in the form
    const form = document.getElementById('filter-form');
    if (!form) return;

    // Station search: submit on Enter
    const stationInput = form.querySelector('input[name="station"]');
    if (stationInput) {
        stationInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') form.submit();
        });
    }

    // When year or month is selected via dropdown, clear time button highlight
    form.querySelectorAll('select[name="year"], select[name="month"]').forEach(function(sel) {
        sel.addEventListener('change', function() {
            document.querySelectorAll('.time-btn').forEach(function(btn) {
                btn.classList.remove('active');
            });
            form.submit();
        });
    });
});


// ===================== TABLE PAGINATION =====================
// Auto-paginate any table with >20 rows. Add data-page-size to table-wrap to customize.
var PAGINATION_SIZE = 20;

function paginateTables() {
    document.querySelectorAll('table').forEach(function(table, idx) {
        var tbody = table.querySelector('tbody');
        if (!tbody) return;
        var rows = Array.from(tbody.querySelectorAll('tr'));
        if (rows.length <= PAGINATION_SIZE) return;

        // Avoid double-pagination
        if (table.dataset.paginated === 'true') return;
        table.dataset.paginated = 'true';

        var pageSize = PAGINATION_SIZE;
        var currentPage = 0;
        var totalPages = Math.ceil(rows.length / pageSize);
        var wrap = table.closest('.table-wrap') || table.parentElement;

        // Create pagination controls
        var pgDiv = document.createElement('div');
        pgDiv.className = 'table-pagination';
        pgDiv.id = 'pg-' + idx;

        function renderPage() {
            var start = currentPage * pageSize;
            var end = start + pageSize;
            rows.forEach(function(r, i) {
                r.style.display = (i >= start && i < end) ? '' : 'none';
            });
            // Update controls
            var info = pgDiv.querySelector('.pg-info');
            if (info) info.textContent = 'Showing ' + (start + 1) + '–' + Math.min(end, rows.length) + ' of ' + rows.length;
            var prevBtn = pgDiv.querySelector('.pg-prev');
            var nextBtn = pgDiv.querySelector('.pg-next');
            if (prevBtn) prevBtn.disabled = currentPage === 0;
            if (nextBtn) nextBtn.disabled = currentPage >= totalPages - 1;
            // Page number buttons
            var pgBtns = pgDiv.querySelector('.pg-btns');
            if (pgBtns) {
                pgBtns.innerHTML = '';
                var maxBtns = 7;
                var startPage = Math.max(0, currentPage - 3);
                var endPage = Math.min(totalPages, startPage + maxBtns);
                for (var p = startPage; p < endPage; p++) {
                    var btn = document.createElement('button');
                    btn.className = 'pg-btn' + (p === currentPage ? ' active' : '');
                    btn.textContent = (p + 1);
                    btn.onclick = function(page) { return function() { currentPage = page; renderPage(); }; }(p);
                    pgBtns.appendChild(btn);
                }
            }
        }

        pgDiv.innerHTML =
            '<span class="pg-info"></span>' +
            '<div class="pg-btns">' +
            '<button class="pg-btn pg-prev" onclick="">&laquo; Prev</button>' +
            '<button class="pg-btn pg-next">Next &raquo;</button>' +
            '</div>';
        var prevBtn = pgDiv.querySelector('.pg-prev');
        var nextBtn = pgDiv.querySelector('.pg-next');
        prevBtn.onclick = function() { if (currentPage > 0) { currentPage--; renderPage(); } };
        nextBtn.onclick = function() { if (currentPage < totalPages - 1) { currentPage++; renderPage(); } };

        wrap.appendChild(pgDiv);
        renderPage();
    });
}

document.addEventListener('DOMContentLoaded', paginateTables);
