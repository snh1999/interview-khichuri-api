import { createZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';

export const CustomZodValidationPipe = createZodValidationPipe({
  createValidationException: (error: z.ZodError): BadRequestException => {
    const response = {
      statusCode: 400,
      message: z.prettifyError(error),
      errors: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };

    return new BadRequestException(response);
  },
});
