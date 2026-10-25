import { type DragEvent, useRef, useState } from 'react';
import { DocumentAddMIcon } from '@alfalab/icons-glyph/DocumentAddMIcon';

import { cx } from '@/shared/lib/cx';
import { formatFileSize } from '@/shared/lib/format';

import { Text } from '../Typography/Text';

import s from './FileDrop.module.css';

export type FileRules = { accepted_formats: string[]; max_size_mb: number };

export function FileDrop({
  onFile,
  type,
  disabled,
  hint,
}: {
  onFile: (file: File) => void;
  type?: FileRules | null;
  disabled?: boolean;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = type?.accepted_formats.map((f) => `.${f}`).join(',');
  const maxBytes = (type?.max_size_mb ?? 30) * 1024 * 1024;

  const take = (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (type && !type.accepted_formats.includes(ext)) {
      setError(`Подойдут файлы: ${type.accepted_formats.join(', ')}`);
      return;
    }
    if (file.size > maxBytes) {
      setError(`Файл больше ${formatFileSize(maxBytes)}`);
      return;
    }
    setError(null);
    onFile(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setActive(false);
    if (!disabled) take(e.dataTransfer.files[0]);
  };

  return (
    <div>
      <div
        className={cx(s.dropzone, active && s.active, disabled && s.disabled)}
        role='button'
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && input.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) input.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setActive(true);
        }}
        onDragLeave={() => setActive(false)}
        onDrop={onDrop}
      >
        <DocumentAddMIcon className={s.icon} />
        <Text medium>Перетащите файл сюда или нажмите, чтобы выбрать</Text>
        <Text small secondary>
          {hint ??
            (type
              ? `${type.accepted_formats.join(', ').toUpperCase()}, до ${type.max_size_mb} МБ`
              : 'PDF, JPG, PNG, XLSX до 30 МБ. Тип документа определит ИИ, вы подтвердите')}
        </Text>
        <input
          ref={input}
          type='file'
          hidden
          accept={accept}
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {error && (
        <Text small color='negative' tag='div'>
          {error}
        </Text>
      )}
    </div>
  );
}
