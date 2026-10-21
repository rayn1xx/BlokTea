import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ProductCard } from '@/features/products/components/ProductCard';
import { useProducts } from '@/features/products/hooks';
import { useCurrentHome } from '@/features/profile/components/AppShell/AppShell';
import type { LegalForm } from '@/shared/types/common';
import { Card, Chips, EmptyState, PageHeader, QueryGate, uiStyles as s } from '@/shared/ui';

export function ProductsScreen() {
  const home = useCurrentHome();
  const navigate = useNavigate();
  const [lf, setLf] = useState<LegalForm>(home.company?.legal_form ?? 'OOO');
  const products = useProducts(lf);

  return (
    <div>
      <PageHeader
        title='Готовые варианты'
        subtitle='Кредиты для бизнеса. Ставки условные, точные условия банк назовёт после рассмотрения'
        right={
          <Chips
            options={[
              { value: 'OOO', label: 'ООО' },
              { value: 'IP', label: 'ИП' },
            ]}
            value={lf}
            onChange={setLf}
          />
        }
      />
      <QueryGate query={products}>
        {(list) =>
          list.length === 0 ? (
            <Card>
              <EmptyState title='Нет подходящих продуктов' />
            </Card>
          ) : (
            <div className={s.grid3}>
              {list.map((p) => (
                <ProductCard key={p.code} product={p} onOpen={() => navigate(`/products/${p.code}`)} />
              ))}
            </div>
          )
        }
      </QueryGate>
    </div>
  );
}
