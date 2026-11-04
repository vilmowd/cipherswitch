"use client";

import { useRef } from "react";

export default function FilePicker({
  id,
  describedBy,
  disabled = false,
  multiple = true,
  files = [],
  showNames = true,
  onChange,
  onClear,
}) {
  const inputRef = useRef(null);
  const names = files.length
    ? files.map((file) => file.name).join(", ")
    : "No file selected";

  function clearFiles() {
    if (inputRef.current) inputRef.current.value = "";
    onClear?.();
  }

  return (
    <div className="file-picker">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept=".zip,.rar,application/zip,application/vnd.rar,application/x-rar-compressed"
        multiple={multiple}
        className="file-picker-input"
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={onChange}
      />
      <label htmlFor={id} className="file-picker-button">
        Select files
      </label>
      {files.length > 0 && onClear ? (
        <button
          type="button"
          className="file-picker-clear"
          onClick={clearFiles}
          disabled={disabled}
        >
          Clear
        </button>
      ) : null}
      {showNames ? <span className="file-picker-names">{names}</span> : null}
    </div>
  );
}
