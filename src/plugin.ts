export default class OpenApiJoiPlugin {
  private serverless: Serverless;
  // private options: Serverless.Options;
  // private commands: Serverless.Commands;
  // private hooks: Serverless.Hooks;

  constructor(serverless: Serverless, options: Serverless.Options) {
    this.serverless = serverless;
    this.serverless.getVersion();
    // this.options = options;
    // this.commands = {};
    // this.hooks = {};
  }
}
