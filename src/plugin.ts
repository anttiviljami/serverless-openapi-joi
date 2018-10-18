
export default class OpenApiJoiPlugin {
  private serverless: Serverless;
  private options: Serverless.Options;
  private commands: Serverless.Commands;
  private hooks: Serverless.Hooks;

  constructor(serverless: Serverless, options: Serverless.Options) {
    this.serverless = serverless;
    this.options = options;
    this.commands = {};
    this.hooks = {};
    (this.serverless, this.options, this.commands, this.hooks);
  }
}
