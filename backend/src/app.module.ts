import { Module, type DynamicModule } from '@nestjs/common';
import { ExplorerController } from './presentation/http/controllers/explorer.controller';
import { ExplorerService } from './application/use-cases/explorer.service';
import {
  CONNECTION_REPOSITORY,
  type ConnectionRepository,
} from './domain/repositories/connection.repository';
import { DATABASE_GATEWAY, type DatabaseGateway } from './domain/repositories/database.gateway';
import { NativeDatabaseGateway } from './infrastructure/database/native-database.gateway';
import { AuthGuard, APP_TOKEN } from './presentation/http/auth.guard';
@Module({})
export class AppModule {
  static register(
    repo: ConnectionRepository,
    token: string,
    gateway: DatabaseGateway = new NativeDatabaseGateway(),
  ): DynamicModule {
    return {
      module: AppModule,
      controllers: [ExplorerController],
      providers: [
        {
          provide: ExplorerService,
          useFactory: (repository: ConnectionRepository, gateway: DatabaseGateway) =>
            new ExplorerService(repository, gateway),
          inject: [CONNECTION_REPOSITORY, DATABASE_GATEWAY],
        },
        AuthGuard,
        { provide: APP_TOKEN, useValue: token },
        { provide: CONNECTION_REPOSITORY, useValue: repo },
        { provide: DATABASE_GATEWAY, useValue: gateway },
      ],
    };
  }
}
