import { useQuery } from '@tanstack/react-query';

import { keys } from '@/shared/api/queryKeys';
import type { LegalForm } from '@/shared/types/common';

import { documentsApi } from './api';

export const useDocumentTypes = (lf?: LegalForm) =>
  useQuery({ queryKey: keys.documentTypes(lf), queryFn: () => documentsApi.types({ legal_form: lf }), staleTime: 300_000 });

const COMPANY_TYPES_FOR_APPLICATION = ['company_docs', 'fin_statements_2025', 'tax_return'];

export const useDocumentsForApplication = (applicationId: string) =>
  useQuery({
    queryKey: keys.documents({ application_id: applicationId, with_company: true }),
    queryFn: async () => {
      const [own, company] = await Promise.all([
        documentsApi.list({ scope: 'application', application_id: applicationId }),
        documentsApi.list({ scope: 'company' }),
      ]);
      return [...company.filter((d) => COMPANY_TYPES_FOR_APPLICATION.includes(d.document_type) && d.status !== 'rejected'), ...own];
    },
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'analyzing') ? 1500 : false),
  });
