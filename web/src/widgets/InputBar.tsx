import { Send } from 'lucide-react';
import { FormEvent, useState } from 'react';

interface InputBarProps {
  disabled?: boolean;
  onSend: (text: string) => void;
}

export function InputBar({ disabled, onSend }: InputBarProps) {
  const [text, setText] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText('');
  };

  return (
    <form className="flex gap-3 border-t border-mist bg-white p-4" onSubmit={submit}>
      <textarea
        className="min-h-11 flex-1 resize-none border border-mist px-3 py-2 text-sm"
        rows={1}
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={disabled}
        placeholder="Message"
      />
      <button
        type="submit"
        className="grid h-11 w-11 place-items-center bg-teal text-white hover:bg-ink disabled:cursor-not-allowed disabled:bg-ink/30"
        disabled={disabled || !text.trim()}
        aria-label="Send message"
        title="Send message"
      >
        <Send size={18} />
      </button>
    </form>
  );
}
