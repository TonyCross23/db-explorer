import type { SavedConnection } from '../entities/connection.entity';
export interface ConnectionRepository {
  all(): Promise<SavedConnection[]>;
  find(id: string): Promise<SavedConnection | undefined>;
  save(value: SavedConnection): Promise<void>;
  delete(id: string): Promise<void>;
}
export const CONNECTION_REPOSITORY = Symbol('ConnectionRepository');
