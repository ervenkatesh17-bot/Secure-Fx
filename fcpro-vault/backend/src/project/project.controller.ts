import {
  Controller,
  Get,
  Header,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsString, IsUUID } from 'class-validator';
import { Request, Response } from 'express';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { Project } from './entities/project.entity';
import { ProjectService } from './project.service';

class DownloadProjectQueryDto {
  @IsUUID('4')
  projectId: string;
}

class StreamProjectQueryDto {
  @IsString()
  token: string;
}

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@Controller('project')
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
  ) {}

  @Get('download')
  @UseGuards(JwtAuthGuard)
  async downloadProject(
    @Query() query: DownloadProjectQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.projectService.getDownloadToken(
      query.projectId,
      req.user.sub,
      req.user.tier ?? 'standard',
    );
  }

  @Get('stream')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  async streamProject(
    @Query() query: StreamProjectQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    await this.projectService.streamProjectToClient(query.token, response);
  }

  @Get('list')
  @UseGuards(JwtAuthGuard)
  async listProjects(): Promise<Project[]> {
    return this.projectRepository.find({
      where: { isPublished: true },
      order: { createdAt: 'DESC' },
    });
  }
}
