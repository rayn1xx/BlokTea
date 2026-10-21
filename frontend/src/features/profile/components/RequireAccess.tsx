import type { ReactNode } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';

import { can, type Capability, CAPABILITY_TEXT, whoCan } from '@/app/access';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import { ROLE_LABELS } from '@/shared/i18n/ru';
import { Card, NoRightsState } from '@/shared/ui';

export function RequireAccess({ capability, children }: { capability: Exclude<Capability, 'bank'>; children?: ReactNode }) {
  const home = useCurrentHome();
  const navigate = useNavigate();

  if (!can(home, capability)) {
    return (
      <Card>
        <NoRightsState
          title='Недостаточно прав'
          text={
            <>
              Раздел «{CAPABILITY_TEXT[capability]}» недоступен для вашей роли
              {home.role ? ` «${ROLE_LABELS[home.role]}»` : ''}. Это могут: {whoCan(capability)}. Права выдаёт собственник в разделе «Команда»
            </>
          }
        />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Button view='secondary' size={48} onClick={() => navigate('/home')}>
            На главную
          </Button>
        </div>
      </Card>
    );
  }

  return <>{children ?? <Outlet context={home} />}</>;
}
