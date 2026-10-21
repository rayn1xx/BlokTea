import { useQuery } from '@tanstack/react-query';

import { keys } from '@/shared/api/queryKeys';
import type { LegalForm } from '@/shared/types/common';

import { documentsApi } from './api';

export const useDocumentTypes = (lf?: LegalForm) =>
  useQuery({ queryKey: keys.documentTypes(lf), queryFn: () => documentsApi.types({ legal_form: lf }), staleTime: 300_000 });
