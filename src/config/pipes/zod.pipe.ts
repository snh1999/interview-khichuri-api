import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  Optional,
  type PipeTransform,
  StandardSchemaValidationPipe,
  type StandardSchemaValidationPipeOptions,
} from "@nestjs/common";
import type { StandardSchemaV1 } from "@standard-schema/spec";

interface SchemaHolder {
  schema?: StandardSchemaV1;
}

@Injectable()
export class CustomZodValidationPipe
  extends StandardSchemaValidationPipe
  implements PipeTransform
{
  constructor(@Optional() options?: StandardSchemaValidationPipeOptions) {
    super({
      ...options,
      exceptionFactory: (issues) => {
        const errors = issues.map((issue) => ({
          path:
            issue.path
              ?.map((segment) =>
                typeof segment === "object"
                  ? String(segment.key)
                  : String(segment),
              )
              .join(".") ?? "",
          message: issue.message,
        }));

        return new BadRequestException({
          statusCode: 400,
          message: errors
            .map((error) =>
              error.path ? `${error.path}: ${error.message}` : error.message,
            )
            .join(", "),
          errors,
        });
      },
    });
  }

  override async transform<T = unknown>(
    value: T,
    metadata: ArgumentMetadata,
  ): Promise<T> {
    const schema =
      metadata.schema ??
      (metadata.metatype as SchemaHolder | undefined)?.schema ??
      (value as { constructor?: SchemaHolder } | undefined)?.constructor
        ?.schema;

    if (!schema || !this.toValidate(metadata)) {
      return value;
    }

    this.stripProtoKeys(value);
    const result = await this.validate(value, schema, this.validateOptions);
    if (result.issues) {
      throw this.exceptionFactory(result.issues);
    }

    return this.isTransformEnabled ? (result.value as T) : value;
  }
}
