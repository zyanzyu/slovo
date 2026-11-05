import { Delete } from 'lucide-react';

const rows = ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбюё'];

export function CyrillicKeyboard({
  onKey,
  onBackspace,
  onSpace,
}: {
  onKey: (key: string) => void;
  onBackspace: () => void;
  onSpace: () => void;
}) {
  return (
    <div className="cyr-keyboard" aria-label="俄语键盘">
      {rows.map((row) => (
        <div className="keyboard-row" key={row}>
          {row.split('').map((key) => (
            <button
              type="button"
              className="cyr-key"
              key={key}
              onPointerDown={(event) => {
                event.preventDefault();
                onKey(key);
              }}
              aria-label={key}
            >
              {key}
            </button>
          ))}
        </div>
      ))}
      <div className="keyboard-row keyboard-actions">
        <button
          type="button"
          className="cyr-key key-space"
          onPointerDown={(event) => {
            event.preventDefault();
            onSpace();
          }}
        >
          пробел
        </button>
        <button
          type="button"
          className="cyr-key key-delete"
          onPointerDown={(event) => {
            event.preventDefault();
            onBackspace();
          }}
          aria-label="退格"
        >
          <Delete size={18} />
        </button>
      </div>
    </div>
  );
}
