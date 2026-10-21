export const isMocks = () => import.meta.env.USE_MOCKS === 'true';

export const isDemoMode = () => import.meta.env.DEMO_MODE === 'true';
