declare namespace Serverless {
  interface Options {
    stage: string | null;
    region: string | null;
    noDeploy?: boolean;
  }

  interface Commands {
    [command: string]: {
      lifecycleEvents: string[];
      options: {
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
    getServiceName(): string;
    getAllFunctions(): string[];
    
    custom: {
      openapi: any;
    };
  }
}
