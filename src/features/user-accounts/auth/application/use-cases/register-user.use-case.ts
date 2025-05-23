import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { UserAccountConfig } from '../../../config/user-account.config';
import { UserCreateModel } from '../../../users/api/models/input/create-user.input.model';
import { BadRequestException } from '@nestjs/common';
import { User } from '../../../users/domain/user.sql.entity';
import { UsersSqlRepository } from '../../../users/infrastructure/users.sql.repository';
import { CryptoService } from '../../../crypto/crypto.service';
import { UuidProvider } from '../../../../../core/helpers/uuid.provider';
import { UserRegistrationEvent } from '../events/user-registration.event';

export class RegisterUserCommand {
  constructor(public userCreateModel: UserCreateModel) {}
}

@CommandHandler(RegisterUserCommand)
export class RegisterUserUseCase
  implements ICommandHandler<RegisterUserCommand, void>
{
  constructor(
    private readonly userAccountConfig: UserAccountConfig,
    private readonly usersSqlRepository: UsersSqlRepository,
    private readonly bcryptService: CryptoService,
    private readonly uuidProvider: UuidProvider,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RegisterUserCommand): Promise<void> {
    const existingUserByLogin =
      await this.usersSqlRepository.findByLoginOrEmail(
        command.userCreateModel.login,
      );
    if (existingUserByLogin) {
      throw new BadRequestException([
        { field: 'login', message: 'Login is not unique' },
      ]);
    }
    const existingUserByEmail =
      await this.usersSqlRepository.findByLoginOrEmail(
        command.userCreateModel.email,
      );
    if (existingUserByEmail) {
      throw new BadRequestException([
        { field: 'email', message: 'Email is not unique' },
      ]);
    }
    const passHash = await this.bcryptService.generateHash(
      command.userCreateModel.password,
    );
    const expirationTime = this.userAccountConfig.CONFIRMATION_CODE_EXPIRATION;
    const newUser: User = {
      id: this.uuidProvider.generate(),
      login: command.userCreateModel.login,
      password: passHash,
      email: command.userCreateModel.email,
      createdAt: new Date(),
      confirmationCode: this.uuidProvider.generate(),
      expirationDate: new Date(new Date().getTime() + expirationTime),
      isConfirmed: false,
    };
    await this.usersSqlRepository.create(newUser);
    this.eventBus.publish(
      new UserRegistrationEvent(newUser.email, newUser.confirmationCode),
    );
  }
}
