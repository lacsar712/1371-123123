(function (global) {
  const WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日'];
  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function fmtDate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function fmtDateTime(d) {
    return `${fmtDate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function parseISODate(s) {
    if (!s) return null;
    const t = new Date(s);
    return isNaN(t.getTime()) ? null : t;
  }

  function startOfDay(d) {
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    return t;
  }

  function endOfDay(d) {
    const t = new Date(d);
    t.setHours(23, 59, 59, 999);
    return t;
  }

  function addDays(d, n) {
    const t = new Date(d);
    t.setDate(t.getDate() + n);
    return t;
  }

  function addMonths(d, n) {
    const t = new Date(d);
    t.setMonth(t.getMonth() + n);
    return t;
  }

  function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  function sameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function isSameOrBefore(a, b) {
    return a.getTime() <= b.getTime();
  }

  function formatTimeHM(d) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function categoryLabel(cat) {
    switch (cat) {
      case 'course':
        return '课程';
      case 'exam':
        return '考试';
      case 'holiday':
        return '假期';
      case 'custom':
        return '自定义';
      default:
        return cat || '';
    }
  }

  const CATEGORY_COLORS = {
    course: '#3b82f6',
    exam: '#ef4444',
    holiday: '#10b981',
    custom: '#6366f1',
  };

  function categoryBadgeChar(cat) {
    switch (cat) {
      case 'course':
        return '课';
      case 'exam':
        return '考';
      case 'holiday':
        return '假';
      case 'custom':
        return '自';
      default:
        return '';
    }
  }

  function resolveCategoryColor(ev) {
    if (ev && typeof ev.categoryColor === 'string' && ev.categoryColor) {
      return ev.categoryColor;
    }
    return CATEGORY_COLORS[ev && ev.category] || CATEGORY_COLORS.custom;
  }

  class Calendar {
    constructor(container, options) {
      this.container =
        typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.container) throw new Error('Calendar container not found');

      this.options = Object.assign(
        {
          view: 'month',
          currentDate: new Date(),
          events: [],
          canCreateCustom: false,
          onCellClick: null,
          onEventClick: null,
          onDateChange: null,
          onViewChange: null,
        },
        options || {}
      );

      this.view = this.options.view;
      this.currentDate = new Date(this.options.currentDate);
      this.events = this.options.events.slice();

      this._render();
    }

    setEvents(events) {
      this.events = Array.isArray(events) ? events.slice() : [];
      this._render();
    }

    setDate(date) {
      this.currentDate = new Date(date);
      this._render();
      if (typeof this.options.onDateChange === 'function') {
        this.options.onDateChange(this.currentDate, this.view);
      }
    }

    setView(view) {
      if (!['month', 'week', 'day'].includes(view)) return;
      this.view = view;
      this._render();
      if (typeof this.options.onViewChange === 'function') {
        this.options.onViewChange(this.view, this.currentDate);
      }
    }

    getViewRange() {
      const start = startOfDay(this._viewStart());
      const end = endOfDay(this._viewEnd());
      return { start, end };
    }

    _viewStart() {
      const d = this.currentDate;
      if (this.view === 'day') return startOfDay(d);
      if (this.view === 'week') return getMonday(d);
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      return getMonday(first);
    }

    _viewEnd() {
      const d = this.currentDate;
      if (this.view === 'day') return startOfDay(d);
      if (this.view === 'week') return addDays(getMonday(d), 6);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const lastMonday = getMonday(last);
      return sameDay(lastMonday, last) ? last : addDays(lastMonday, 6);
    }

    _header() {
      const title = this._titleText();
      const canCreate = this.options.canCreateCustom;
      return `
        <div class="cal-header">
          <div class="cal-nav-left">
            <button type="button" class="cal-nav-btn" data-action="prev" title="上一周期">‹</button>
            <button type="button" class="cal-nav-btn cal-today" data-action="today">今天</button>
            <button type="button" class="cal-nav-btn" data-action="next" title="下一周期">›</button>
            <h2 class="cal-title">${title}</h2>
          </div>
          <div class="cal-nav-right">
            ${
              canCreate
                ? `<button type="button" class="cal-btn-create" data-action="create">+ 新建事件</button>`
                : ''
            }
            <div class="cal-view-switch">
              <button type="button" class="cal-view-btn ${this.view === 'day' ? 'active' : ''}" data-view="day">日</button>
              <button type="button" class="cal-view-btn ${this.view === 'week' ? 'active' : ''}" data-view="week">周</button>
              <button type="button" class="cal-view-btn ${this.view === 'month' ? 'active' : ''}" data-view="month">月</button>
            </div>
          </div>
        </div>
        <div class="cal-legend">
          <span class="cal-legend-item"><i style="background:#3b82f6"></i>课程</span>
          <span class="cal-legend-item"><i style="background:#ef4444"></i>考试</span>
          <span class="cal-legend-item"><i style="background:#10b981"></i>假期</span>
          <span class="cal-legend-item"><i style="background:#6366f1"></i>自定义</span>
        </div>
      `;
    }

    _titleText() {
      const d = this.currentDate;
      if (this.view === 'day') {
        const wd = WEEK_DAYS[(d.getDay() + 6) % 7];
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${wd}`;
      }
      if (this.view === 'week') {
        const start = getMonday(d);
        const end = addDays(start, 6);
        const sameYear = start.getFullYear() === end.getFullYear();
        const sameMonth = sameYear && start.getMonth() === end.getMonth();
        if (sameMonth) {
          return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 - ${end.getDate()}日`;
        }
        if (sameYear) {
          return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 - ${end.getMonth() + 1}月${end.getDate()}日`;
        }
        return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 - ${end.getFullYear()}年${end.getMonth() + 1}月${end.getDate()}日`;
      }
      return `${d.getFullYear()}年${d.getMonth() + 1}月`;
    }

    _render() {
      const body =
        this.view === 'month'
          ? this._renderMonth()
          : this.view === 'week'
            ? this._renderTimeGrid(7)
            : this._renderTimeGrid(1);

      this.container.innerHTML = `<div class="cal-wrap">${this._header()}${body}</div>`;
      this._bindEvents();
    }

    _renderMonth() {
      const start = this._viewStart();
      const end = this._viewEnd();
      const today = startOfDay(new Date());
      const curMonth = this.currentDate.getMonth();
      const curYear = this.currentDate.getFullYear();
      let rows = '';
      let day = new Date(start);
      while (day <= end) {
        let cells = '';
        for (let i = 0; i < 7; i++) {
          const isToday = sameDay(day, today);
          const inMonth = day.getMonth() === curMonth && day.getFullYear() === curYear;
          const dayEvents = this._eventsOnDay(day);
          const previewEvents = dayEvents.slice(0, 3);
          const more = dayEvents.length - previewEvents.length;
          const cellDate = fmtDate(day);

          let eventsHtml = previewEvents
            .map((e) => {
              const bg = hexToRgba(e.color || CATEGORY_COLORS[e.category] || '#6366f1', 0.85);
              const catBorder = resolveCategoryColor(e);
              const time = this._eventTimeLabel(e);
              const cat = e.category || 'custom';
              const badge = categoryBadgeChar(cat);
              return `
                <div class="cal-event-chip cal-ev-${cat}" data-event-id="${e.id}"
                     style="background:${bg};border-left:4px solid ${catBorder};"
                     title="[${categoryLabel(cat)}] ${this._escapeAttr(e.title)}${time ? ' · ' + time : ''}">
                  <span class="cal-ev-badge" style="background:${catBorder};">${badge}</span>
                  ${time ? `<span class="cal-ev-time">${time}</span>` : ''}
                  <span class="cal-ev-title">${this._escapeHtml(e.title)}</span>
                </div>
              `;
            })
            .join('');

          if (more > 0) {
            eventsHtml += `<div class="cal-event-more">+${more} 更多</div>`;
          }

          cells += `
            <div class="cal-cell ${inMonth ? '' : 'out-of-month'} ${isToday ? 'today' : ''}"
                 data-date="${cellDate}" data-ts="${day.getTime()}">
              <div class="cal-cell-head">
                <span class="cal-cell-date ${isToday ? 'today-dot' : ''}">${day.getDate()}</span>
              </div>
              <div class="cal-cell-body">${eventsHtml}</div>
              ${
                this.options.canCreateCustom
                  ? `<button type="button" class="cal-cell-add" data-action="add-on-date" data-date="${cellDate}" title="新建事件">+</button>`
                  : ''
              }
            </div>
          `;
          day = addDays(day, 1);
        }
        rows += `<div class="cal-row">${cells}</div>`;
      }
      const header =
        '<div class="cal-col-head">' +
        WEEK_DAYS.map((d) => `<div class="cal-col-head-item">周${d}</div>`).join('') +
        '</div>';
      return `<div class="cal-month">${header}<div class="cal-body">${rows}</div></div>`;
    }

    _renderTimeGrid(daysCount) {
      const start = startOfDay(this._viewStart());
      const today = startOfDay(new Date());
      const slotHeight = 48;
      const hourLabelWidth = 64;

      let colHeaders = '';
      let dayCols = '';
      for (let i = 0; i < daysCount; i++) {
        const day = addDays(start, i);
        const isToday = sameDay(day, today);
        const wd = WEEK_DAYS[(day.getDay() + 6) % 7];
        colHeaders += `
          <div class="tg-col-head ${isToday ? 'today' : ''}">
            <div class="tg-wd">周${wd}</div>
            <div class="tg-date ${isToday ? 'today-dot' : ''}">${day.getMonth() + 1}/${day.getDate()}</div>
          </div>
        `;
        const dayEvents = this._eventsOnDay(day);
        const laidOut = this._layoutDayEvents(dayEvents);
        let eventsHtml = laidOut
          .map((e) => {
            const topPct = e.topRatio * 100;
            const hPct = e.heightRatio * 100;
            const leftPct = e.leftRatio * 100;
            const wPct = e.widthRatio * 100;
            const bg = hexToRgba(e.color || CATEGORY_COLORS[e.category] || '#6366f1', 0.9);
            const catBorder = resolveCategoryColor(e);
            const cat = e.category || 'custom';
            const badge = categoryBadgeChar(cat);
            const time = this._eventTimeLabel(e);
            return `
              <div class="tg-event tg-ev-${cat}" data-event-id="${e.id}"
                   style="top:${topPct}%;height:${hPct}%;left:${leftPct}%;width:${wPct}%;
                          background:${bg};border-left:4px solid ${catBorder};">
                <div class="tg-ev-top">
                  <span class="tg-ev-badge" style="background:${catBorder};">${badge}</span>
                  <span class="tg-ev-title">${this._escapeHtml(e.title)}</span>
                </div>
                ${time ? `<div class="tg-ev-time">${time}</div>` : ''}
                ${e.location ? `<div class="tg-ev-loc">${this._escapeHtml(e.location)}</div>` : ''}
              </div>
            `;
          })
          .join('');

        const cellDate = fmtDate(day);
        dayCols += `
          <div class="tg-day-col" data-date="${cellDate}" data-ts="${day.getTime()}">
            <div class="tg-grid-lines">
              ${HOURS.slice(0, 23)
                .map(
                  (_, idx) =>
                    `<div class="tg-hour-line" style="top:${((idx + 1) / 24) * 100}%;"></div>`
                )
                .join('')}
            </div>
            <div class="tg-events-layer">${eventsHtml}</div>
            ${
              this.options.canCreateCustom
                ? `<div class="tg-click-layer" data-date="${cellDate}"></div>`
                : ''
            }
          </div>
        `;
      }

      const hourLabels = HOURS.map(
        (h) => `
          <div class="tg-hour-label" style="height:${slotHeight}px;line-height:${slotHeight}px;">
            ${pad2(h)}:00
          </div>
        `
      ).join('');

      const totalHeight = HOURS.length * slotHeight;

      const gutterLabel = daysCount === 1 ? '' : '<div class="tg-gutter-label"></div>';

      return `
        <div class="cal-timegrid" style="--slot-h:${slotHeight}px;--hour-w:${hourLabelWidth}px;--total-h:${totalHeight}px;">
          <div class="tg-head">
            ${gutterLabel}
            <div class="tg-head-days">${colHeaders}</div>
          </div>
          <div class="tg-body">
            <div class="tg-hours">${hourLabels}</div>
            <div class="tg-days" style="height:${totalHeight}px;">${dayCols}</div>
          </div>
        </div>
      `;
    }

    _layoutDayEvents(events) {
      const dayStart = 0;
      const dayEnd = 24 * 60;
      const items = events
        .map((e) => {
          const s = parseISODate(e.startTime);
          const en = parseISODate(e.endTime);
          if (!s || !en) return null;
          let startMin = s.getHours() * 60 + s.getMinutes();
          let endMin = en.getHours() * 60 + en.getMinutes();
          if (endMin <= startMin) endMin = startMin + 30;
          startMin = Math.max(dayStart, Math.min(dayEnd, startMin));
          endMin = Math.max(dayStart, Math.min(dayEnd, endMin));
          return {
            ...e,
            _s: startMin,
            _e: endMin,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a._s - b._s || (b._e - b._s) - (a._e - a._s));

      const columns = [];
      const placed = [];
      for (const ev of items) {
        let colIdx = 0;
        while (true) {
          if (!columns[colIdx]) columns[colIdx] = [];
          const col = columns[colIdx];
          const conflict = col.some(
            (o) => !(ev._e <= o._s || ev._s >= o._e)
          );
          if (!conflict) break;
          colIdx++;
        }
        if (!placed[colIdx]) placed[colIdx] = [];
        placed[colIdx].push(ev);
        columns[colIdx].push(ev);
      }

      const totalSpan = columns.length || 1;
      const out = [];
      for (let i = 0; i < placed.length; i++) {
        const widthRatio = 1 / totalSpan;
        const leftRatio = i * widthRatio;
        for (const ev of placed[i]) {
          const range = dayEnd - dayStart;
          const topRatio = (ev._s - dayStart) / range;
          const heightRatio = Math.max(0.015, (ev._e - ev._s) / range);
          out.push(Object.assign({}, ev, {
            topRatio,
            heightRatio,
            leftRatio,
            widthRatio,
          }));
        }
      }
      return out;
    }

    _eventsOnDay(day) {
      const s = startOfDay(day);
      const e = endOfDay(day);
      return this.events.filter((ev) => {
        const es = parseISODate(ev.startTime);
        const ee = parseISODate(ev.endTime);
        if (!es || !ee) return false;
        return isSameOrBefore(es, e) && isSameOrBefore(s, ee);
      });
    }

    _eventTimeLabel(e) {
      const s = parseISODate(e.startTime);
      const en = parseISODate(e.endTime);
      if (!s || !en) return '';
      const spanMin = (en - s) / 60000;
      if (spanMin >= 24 * 60 - 1) return '';
      return `${formatTimeHM(s)} - ${formatTimeHM(en)}`;
    }

    _escapeHtml(s) {
      const div = document.createElement('div');
      div.textContent = s == null ? '' : String(s);
      return div.innerHTML;
    }

    _escapeAttr(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    _findEvent(id) {
      return this.events.find((e) => String(e.id) === String(id));
    }

    _bindEvents() {
      this.container.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const action = btn.dataset.action;
          if (action === 'prev') this._navPrev();
          else if (action === 'next') this._navNext();
          else if (action === 'today') this.setDate(new Date());
          else if (action === 'create') this._emitCreate(new Date());
          else if (action === 'add-on-date') {
            const d = parseISODate(btn.dataset.date + 'T09:00:00');
            if (d) this._emitCreate(d);
          }
        });
      });

      this.container.querySelectorAll('[data-view]').forEach((btn) => {
        btn.addEventListener('click', () => this.setView(btn.dataset.view));
      });

      this.container.querySelectorAll('[data-event-id]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const ev = this._findEvent(el.dataset.eventId);
          if (ev && typeof this.options.onEventClick === 'function') {
            this.options.onEventClick(ev, el);
          }
        });
      });

      const tgClickLayers = this.container.querySelectorAll('.tg-click-layer');
      if (this.options.canCreateCustom && tgClickLayers.length) {
        tgClickLayers.forEach((layer) => {
          layer.addEventListener('click', (e) => {
            const rect = layer.getBoundingClientRect();
            const ratio = (e.clientY - rect.top) / rect.height;
            const totalMin = Math.round(ratio * 24 * 60);
            const snapMin = Math.round(totalMin / 30) * 30;
            const h = Math.floor(snapMin / 60);
            const m = snapMin % 60;
            const dateStr = layer.dataset.date;
            const start = parseISODate(`${dateStr}T${pad2(h)}:${pad2(m)}:00`);
            if (start) this._emitCreate(start);
          });
        });
      }

      if (this.options.canCreateCustom) {
        this.container.querySelectorAll('.cal-cell').forEach((cell) => {
          cell.addEventListener('dblclick', (e) => {
            if (e.target.closest('[data-event-id]')) return;
            const d = parseISODate(cell.dataset.date + 'T09:00:00');
            if (d) this._emitCreate(d);
          });
        });
      }
    }

    _navPrev() {
      let d;
      if (this.view === 'day') d = addDays(this.currentDate, -1);
      else if (this.view === 'week') d = addDays(this.currentDate, -7);
      else d = addMonths(this.currentDate, -1);
      this.setDate(d);
    }

    _navNext() {
      let d;
      if (this.view === 'day') d = addDays(this.currentDate, 1);
      else if (this.view === 'week') d = addDays(this.currentDate, 7);
      else d = addMonths(this.currentDate, 1);
      this.setDate(d);
    }

    _emitCreate(defaultStart) {
      if (typeof this.options.onCellClick === 'function') {
        this.options.onCellClick(new Date(defaultStart));
      }
    }
  }

  global.Calendar = Calendar;
  global.CalendarUtils = {
    fmtDate,
    fmtDateTime,
    parseISODate,
    startOfDay,
    endOfDay,
    addDays,
    formatTimeHM,
    categoryLabel,
    pad2,
  };
})(window);
