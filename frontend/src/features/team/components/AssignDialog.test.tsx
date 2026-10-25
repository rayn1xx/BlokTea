import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeHome, makeMember } from '@/test/fixtures';

import { AssignDialog } from './AssignDialog';

const members = [
  makeMember({ id: 'm-fedorov', user_id: 'u-2', last_name: 'Фёдоров', first_name: 'Пётр' }),
  makeMember({ id: 'm-ivanova', user_id: 'u-3', last_name: 'Иванова', first_name: 'Ольга', role: 'banking_employee', permissions: [] }),
  makeMember({ id: 'm-me', user_id: 'u-owner', last_name: 'Смирнова', first_name: 'Анна', role: 'owner' }),
];

vi.mock('@/features/team/hooks', () => ({ useMembers: () => ({ data: members, isLoading: false }) }));
vi.mock('@/features/profile/hooks', () => ({ useHome: () => ({ data: makeHome() }) }));

function renderDialog(onAssign = vi.fn().mockResolvedValue(undefined), onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <AssignDialog title='Запросить документ у сотрудника' taskTitle='Бухгалтерский баланс' permission='upload_documents' excludeUserId='u-owner' onClose={onClose} onAssign={onAssign} />
    </MemoryRouter>,
  );
  return { onAssign, onClose };
}

describe('AssignDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('не показывает текущего пользователя', () => {
    renderDialog();
    expect(screen.queryByText(/Смирнова/)).not.toBeInTheDocument();
  });

  it('сотрудник без нужного права недоступен для выбора', () => {
    renderDialog();
    const ivanova = screen.getByRole('radio', { name: /Иванова/ });
    expect(ivanova).toBeDisabled();
    expect(within(ivanova).getByText('Нет доступа к этой задаче')).toBeInTheDocument();
  });

  it('поиск находит «Фёдоров» по запросу «федоров»', async () => {
    renderDialog();
    await userEvent.type(screen.getByPlaceholderText('Поиск по имени или должности'), 'федоров');
    expect(screen.getByRole('radio', { name: /Фёдоров/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Иванова/ })).not.toBeInTheDocument();
  });

  it('передаёт выбранного сотрудника и комментарий', async () => {
    const { onAssign, onClose } = renderDialog();
    await userEvent.click(screen.getByRole('radio', { name: /Фёдоров/ }));
    await userEvent.click(screen.getByText('Добавить комментарий'));
    await userEvent.type(screen.getByPlaceholderText('Комментарий для сотрудника'), 'За 2025 год');
    await userEvent.click(screen.getByRole('button', { name: 'Назначить: Пётр' }));
    expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ id: 'm-fedorov' }), 'За 2025 год');
    expect(onClose).toHaveBeenCalled();
  });

  it('показывает ошибку сервера по полю и не закрывается', async () => {
    const { ApiError } = await import('@/shared/api/client');
    const onAssign = vi.fn().mockRejectedValue(new ApiError(422, 'VALIDATION_ERROR', 'Проверьте поля', { member_id: 'Нет права загрузки' }));
    const { onClose } = renderDialog(onAssign);
    await userEvent.click(screen.getByRole('radio', { name: /Фёдоров/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Назначить: Пётр' }));
    expect(await screen.findByText('Нет права загрузки')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
