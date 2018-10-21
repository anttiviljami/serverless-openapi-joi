declare namespace Serverless {
  interface Options {
    function: string;
  }

  interface Commands {
    [command: string]: {
      usage: string;
      lifecycleEvents: string[];
      options?: {
        [option: string]: {
          usage: string;
          required?: boolean;
          shortcut?: string;
        }
      }
    }
  }

  interface Hooks {
    [hook: string]: () => void;
  }

  interface Function {
    handler: string;
    events: Array<{
      http?: {
        path: string;
        method: string;
        cors?: boolean;
        private?: boolean;
        timeout?: number;
      };
    }>
  }
}

declare interface Serverless {
  init(): Promise<any>;
  run(): Promise<any>;
  getVersion(): string;
  
  cli: {
    log(message: string): null;
  };
  
  config: {
    servicePath: string;
  };

  service: {
    getFunction(functionName: string): Serverless.Function;
    custom: {
      openapi: any;
    };
  }
}
