import { HttpException, HttpStatus } from '@nestjs/common';

export class ApiError extends HttpException {
  constructor(
    public readonly error: string,
    message: string,
    status: HttpStatus,
  ) {
    super({ error, message }, status);
  }
}
