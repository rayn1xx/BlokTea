import { describe, expect, it } from 'vitest';

import { makeHome } from '@/test/fixtures';

import { can, rolesWith } from './access';

describe('can', () => {
  it('без профиля ничего нельзя', () => {
    expect(can(undefined, 'apply')).toBe(false);
  });

  it('собственник может всё в кабинете клиента', () => {
    const home = makeHome({ role: 'owner' });
    expect(can(home, 'apply')).toBe(true);
    expect(can(home, 'manage_team')).toBe(true);
    expect(can(home, 'bank')).toBe(false);
  });

  it('бухгалтер не подаёт заявки, но подписывает', () => {
    const home = makeHome({ role: 'cfo_or_accountant' });
    expect(can(home, 'apply')).toBe(false);
    expect(can(home, 'sign')).toBe(true);
  });

  it('явные права сотрудника важнее прав по роли', () => {
    const home = makeHome({ role: 'authorized_employee', permissions: ['upload_documents', 'sign'] });
    expect(can(home, 'sign')).toBe(true);
  });

  it('сотруднику банка закрыты действия клиента', () => {
    const home = makeHome({ role: null, bank_role: 'underwriter' });
    expect(can(home, 'bank')).toBe(true);
    expect(can(home, 'upload_documents')).toBe(false);
  });
});

describe('rolesWith', () => {
  it('управлять командой может только собственник', () => {
    expect(rolesWith('manage_team')).toEqual(['owner']);
  });
});
