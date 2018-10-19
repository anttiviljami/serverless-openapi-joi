import OpenAPIBuilder from '../src/openapi';
import { routes } from './util/routes';
import { extend, ExtendedMatchers } from './util/jest-openapi';
extend(expect);

describe('OpenAPI', () => {
  test('builds valid openapi spec with minimal constructor opts', async () => {
    const openapi = new OpenAPIBuilder({
      info: {
        title: 'Example API',
        version: '1.0.0',
      },
      routes,
    });
    const definition = await openapi.getDefinition();
    (expect(definition) as ExtendedMatchers).toBeValidOpenAPI();
  });

  test('builds valid openapi spec with all constructor opts', async () => {
    const openapi = new OpenAPIBuilder({
      info: {
        title: 'Example CRUD Pet API',
        description: 'Example CRUD API to demonstrate auto-generated openapi docs with Joi',
        version: '1.0.0',
        termsOfService: 'https://github.com/anttiviljami/serverless-openapi-joi',
        license: {
          name: 'MIT',
          url: 'https://github.com/anttiviljami/serverless-openapi-joi/blob/master/LICENSE',
        },
        contact: {
          name: 'Viljami Kuosmanen',
          url: 'https://github.com/anttiviljami',
          email: 'viljami@avoinsorsa.fi',
        },
      },
      externalDocs: {
        description: 'README',
        url: 'https://github.com/anttiviljami/serverless-openapi-joi',
      },
      servers: [
        {
          description: 'local',
          url: 'http://localhost',
        },
        {
          description: 'production',
          url: 'https://production.api.com',
        },
      ],
      routes,
    });
    const definition = await openapi.getDefinition();
    (expect(definition) as ExtendedMatchers).toBeValidOpenAPI();
  });
});
