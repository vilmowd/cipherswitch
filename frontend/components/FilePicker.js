export default function FilePicker({
  id,
  describedBy,
  disabled = false,
  multiple = true,
  files = [],
  showNames = true,
  onChange,
}) {
  const names = files.length
    ? files.map((file) => file.name).join(", ")
    : "No file selected";

  return (
    <div className="file-picker">
      <input
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
      {showNames ? <span className="file-picker-names">{names}</span> : null}
    </div>
  );
}
