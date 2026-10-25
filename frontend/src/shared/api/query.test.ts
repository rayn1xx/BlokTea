import { describe, expect, it } from 'vitest';

import { ERRORS } from '@/shared/i18n/ru';

import { ApiError } from './client';
import { errorText, fieldErrors } from './query';

describe('errorText', () => {
  it('не-API ошибка даёт общий текст', () => {
    expect(errorText(new Error('boom'))).toBe(ERRORS.generic);
  });

  it('известные коды переводятся в понятные тексты', () => {
    expect(errorText(new ApiError(0, 'NETWORK_ERROR', ''))).toBe(ERRORS.network);
    expect(errorText(new ApiError(409, 'VERSION_CONFLICT', 'conflict'))).toBe(ERRORS.versionConflict);
  });

  it('для остальных кодов показывает сообщение сервера', () => {
    expect(errorText(new ApiError(404, 'NOT_FOUND', 'Заявка не найдена'))).toBe('Заявка не найдена');
  });
});

describe('fieldErrors', () => {
  it('отдаёт ошибки полей только для VALIDATION_ERROR', () => {
    const details = { approve_min: 'Пороги по возрастанию' };
    expect(fieldErrors(new ApiError(422, 'VALIDATION_ERROR', 'Проверьте поля', details))).toEqual(details);
    expect(fieldErrors(new ApiError(404, 'NOT_FOUND', 'нет'))).toEqual({});
  });
});
