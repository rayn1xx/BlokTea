import type { ComponentType, SVGProps } from 'react';
import { BanknoteStackMIcon } from '@alfalab/icons-glyph/BanknoteStackMIcon';
import { BriefcaseMIcon } from '@alfalab/icons-glyph/BriefcaseMIcon';
import { FactoryMIcon } from '@alfalab/icons-glyph/FactoryMIcon';
import { LightningMIcon } from '@alfalab/icons-glyph/LightningMIcon';
import { RepeatMIcon } from '@alfalab/icons-glyph/RepeatMIcon';
import { StarMIcon } from '@alfalab/icons-glyph/StarMIcon';
import { WalletMIcon } from '@alfalab/icons-glyph/WalletMIcon';

import type { ProductCode } from '@/shared/types/common';

export const PRODUCT_ICONS: Record<ProductCode, ComponentType<SVGProps<SVGSVGElement>>> = {
  working_capital: BanknoteStackMIcon,
  investment: FactoryMIcon,
  overdraft: WalletMIcon,
  credit_line: RepeatMIcon,
  express: LightningMIcon,
  any_purpose: BriefcaseMIcon,
  gov_program: StarMIcon,
};
