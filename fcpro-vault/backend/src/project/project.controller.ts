import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsUUID } from 'class-validator';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { Project } from './entities/project.entity';
import { ProjectService } from './project.service';

class DownloadProjectQueryDto {
  @IsUUID('4')
  projectId: string;
}

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@Controller('project')
@UseGuards(JwtAuthGuard)
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
  ) {}

  @Get('download')
  async downloadProject(
    @Query() query: DownloadProjectQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.projectService.generateDownloadUrl(
      query.projectId,
      req.user.sub,
      req.user.tier ?? 'standard',
    );
  }

  @Get('list')
  async listProjects(): Promise<Project[]> {
    return this.projectRepository.find({
      where: { isPublished: true },
      order: { createdAt: 'DESC' },
    });
  }
}
