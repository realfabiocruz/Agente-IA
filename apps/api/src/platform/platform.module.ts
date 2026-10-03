import { Global, Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Global()
@Module({ controllers: [PlatformController], providers: [PlatformService], exports: [PlatformService] })
export class PlatformModule {}
