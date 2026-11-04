"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(value) {
  return String(value).padStart(2, "0");
}

function parseValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || "");
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
    0
  );
}

function formatValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function nextQuarter(from = new Date()) {
  const date = new Date(from);
  date.setSeconds(0, 0);
  const remainder = date.getMinutes() % 15;
  date.setMinutes(date.getMinutes() + (remainder === 0 ? 15 : 15 - remainder));
  return date;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function monthGrid(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

export default function DateTimeField({ id, value, onChange, disabled = false }) {
  const buttonRef = useRef(null);
  const popRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => parseValue(value) || new Date());
  const [box, setBox] = useState(null);
  const selected = parseValue(value);
  const today = startOfDay(new Date());

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event) => {
      const target = event.target;
      if (popRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  function openPicker() {
    if (disabled) return;
    const base = parseValue(value) || nextQuarter();
    setCursor(base);
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 320;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const below = window.innerHeight - rect.bottom;
      setBox(below < 380 && rect.top > 380
        ? { left, bottom: window.innerHeight - rect.top + 8, top: "auto" }
        : { left, top: rect.bottom + 8, bottom: "auto" });
    }
    setOpen(true);
  }

  function chooseDay(day) {
    if (startOfDay(day) < today) return;
    const current = parseValue(value);
    const next = new Date(day);
    next.setHours(current ? current.getHours() : 9, current ? current.getMinutes() : 0, 0, 0);
    if (next.getTime() <= Date.now()) {
      const soon = nextQuarter();
      if (sameDay(soon, day)) {
        next.setHours(soon.getHours(), soon.getMinutes(), 0, 0);
      }
    }
    if (next.getTime() <= Date.now()) return;
    onChange(formatValue(next));
  }

  function chooseTime(hour, minute) {
    const current = parseValue(value) || nextQuarter();
    const next = new Date(current);
    next.setHours(hour, minute, 0, 0);
    if (startOfDay(next) < today || next.getTime() <= Date.now()) return;
    onChange(formatValue(next));
  }

  const label = selected
    ? selected.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : "Select date";
  const hour = selected ? selected.getHours() : 9;
  const minute = selected ? selected.getMinutes() : 0;
  const days = monthGrid(cursor);

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className="date-field"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPicker}
      >
        <span>{label}</span>
      </button>
      {open && box
        ? createPortal(
          <div
            ref={popRef}
            className="date-pop"
            role="dialog"
            aria-label="Choose a date"
            style={{ left: box.left, top: box.top, bottom: box.bottom }}
          >
            <div className="date-pop-head">
              <button type="button" className="date-nav" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
              <p className="date-month">
                {cursor.toLocaleString([], { month: "long", year: "numeric" })}
              </p>
              <button type="button" className="date-nav" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month">›</button>
            </div>
            <div className="date-week">
              {WEEKDAYS.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="date-grid">
              {days.map((day) => {
                const past = startOfDay(day) < today;
                const outside = day.getMonth() !== cursor.getMonth();
                const active = selected && sameDay(selected, day);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className={`date-day${active ? " is-selected" : ""}${outside ? " is-outside" : ""}`}
                    disabled={past}
                    onClick={() => chooseDay(day)}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="date-time">
              <label>
                Hour
                <select
                  value={hour}
                  onChange={(event) => chooseTime(Number(event.target.value), minute)}
                  disabled={!selected}
                >
                  {Array.from({ length: 24 }, (_, index) => (
                    <option key={index} value={index}>{pad(index)}</option>
                  ))}
                </select>
              </label>
              <label>
                Minute
                <select
                  value={[0, 15, 30, 45].includes(minute) ? minute : 0}
                  onChange={(event) => chooseTime(hour, Number(event.target.value))}
                  disabled={!selected}
                >
                  {[0, 15, 30, 45].map((item) => (
                    <option key={item} value={item}>{pad(item)}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="date-actions">
              <button type="button" className="date-clear" onClick={() => { onChange(""); setOpen(false); }}>
                Clear
              </button>
              <button type="button" className="date-done" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>,
          document.body
        )
        : null}
    </>
  );
}
