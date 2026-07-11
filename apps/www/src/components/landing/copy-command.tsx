interface CopyCommandProps {
  command: string;
  copyLabel: string;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function CopyCommand({ command, copyLabel }: CopyCommandProps) {
  return (
    <code className="install-command">
      <span aria-hidden="true">$</span>
      <span>{command}</span>
      <button type="button" onClick={() => void copyText(command)} aria-label={copyLabel}>
        Copy
      </button>
    </code>
  );
}
