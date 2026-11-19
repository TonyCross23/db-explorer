import type { ConnectionInput } from '@db-explorer/shared';
export type SavedConnection = ConnectionInput & { id: string; createdAt: string };
