import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ExplorerService } from '../../../application/use-cases/explorer.service';
import {
  connectionSchema,
  connectionUpdateSchema,
  rowQuerySchema,
  idSchema,
  type ConnectionInput,
  type ConnectionUpdate,
  type RowQuery,
} from '../../../application/dtos/connection.dto';
import { ZodPipe } from '../zod.pipe';
import { AuthGuard } from '../auth.guard';
import {
  diagramQuerySchema,
  type DiagramQuery,
  sshProbeSchema,
  sshSchema,
  type SshOptions,
} from '@db-explorer/shared';
@Controller('connections')
@UseGuards(AuthGuard)
export class ExplorerController {
  constructor(private readonly explorer: ExplorerService) {}
  @Post('ssh-fingerprint') fingerprint(
    @Body(new ZodPipe(sshProbeSchema)) input: { host: string; port: number },
  ) {
    return this.explorer.sshFingerprint(input.host, input.port);
  }
  @Post('ssh-test') testSsh(@Body(new ZodPipe(sshSchema)) input: SshOptions) {
    return this.explorer.testSsh(input);
  }
  @Get() list() {
    return this.explorer.list();
  }
  @Post() create(@Body(new ZodPipe(connectionSchema)) input: ConnectionInput) {
    return this.explorer.create(input);
  }
  @Post('test') test(@Body(new ZodPipe(connectionSchema)) input: ConnectionInput) {
    return this.explorer.test(input);
  }
  @Patch(':id') update(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Body(new ZodPipe(connectionUpdateSchema)) input: ConnectionUpdate,
  ) {
    return this.explorer.update(id, input);
  }
  @Delete(':id') remove(@Param('id', new ZodPipe(idSchema)) id: string) {
    return this.explorer.remove(id);
  }
  @Post(':id/test') testSaved(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Body() input: unknown,
  ) {
    return this.explorer.testSaved(
      id,
      input && Object.keys(input).length
        ? new ZodPipe(connectionUpdateSchema).transform(input)
        : undefined,
    );
  }
  @Get(':id/tables') tables(@Param('id', new ZodPipe(idSchema)) id: string) {
    return this.explorer.tables(id);
  }
  @Get(':id/diagram') diagram(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Query(new ZodPipe(diagramQuerySchema)) query: DiagramQuery,
  ) {
    return this.explorer.diagram(id, query.schema);
  }
  @Get(':id/rows') rows(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Query(new ZodPipe(rowQuerySchema)) query: RowQuery,
  ) {
    return this.explorer.rows(id, query);
  }
}
