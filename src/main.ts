import { VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { getAllowedMethods, getCorsConfig } from "./config/utils/cors.config";

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
    prefix: "api/v",
  });

  app.enableCors({
    methods: getAllowedMethods(),
    ...getCorsConfig(),
  });

  app.use(helmet());

  await app.listen(process.env.PORT ?? 3000);
};

bootstrap();
