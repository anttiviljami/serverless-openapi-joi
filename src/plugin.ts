import util from 'util';
import path from 'path';
import OpenAPIHandler from './handler';

export default class OpenApiJoiPlugin {
  private serverless: Serverless;
  private commands: Serverless.Commands;
  private hooks: Serverless.Hooks;
  private options: Serverless.Options;

  constructor(serverless: Serverless, options: Serverless.Options) {
    this.serverless = serverless;
    this.serverless.getVersion();
    this.options = options;
    this.commands = {
      openapi: {
        usage: 'Output OpenAPI documentation for a function',
        lifecycleEvents: [
          'specification',
        ],
        options: {
          function: {
            usage: 'function to generate OpenAPI docs',
            shortcut: 'f',
            required: true,
          },
        },
      },
    };

    this.hooks = {
      'openapi:specification': this.getSpecification.bind(this),
    };
  }

  public async getSpecification() {
    try {
      const func = this.serverless.service.getFunction(this.options.function);
      const handlerPath = func.handler.split('.')[0];
      const handlerName = func.handler.split('.')[1];
      const requirePath = path.join(this.serverless.config.servicePath, handlerPath);
      const handler = require(requirePath)[handlerName];

      // call handler with command context
      const result = await handler({
        command: {
          name: 'openapi:specification',
          options: this.options,
        },
      });

      // output the body
      // tslint:disable-next-line no-console
      console.log(result.body);
    } catch (err) {
      this.serverless.cli.log(`Error: ${err.message}`);
      process.exit(1);
    }
  }
}
